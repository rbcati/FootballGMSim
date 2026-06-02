import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PreDraftPanel({ league, actions, onDraftStarted, disabled = false }) {
  const [progressing, setProgressing] = useState(false);
  const [progressResult, setProgressResult] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const phase = league?.phase ?? '';
  // Progression can only run during the 'offseason_resign' / 'offseason' phase.
  // In every other phase it has either already happened (free_agency / draft) or
  // isn't applicable (regular / preseason / playoffs).  Treating it as "done"
  // disables the button and prevents the "Not in offseason phase" error.
  const progressionDone =
    !['offseason_resign', 'offseason'].includes(phase) ||
    (league?.offseasonProgressionDone ?? false);
  // "Start Draft" is only valid once the worker has entered the 'draft' phase.
  const isDraftPhase = phase === 'draft';

  // Guard: show an informational placeholder when we're nowhere near the draft
  if (!['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(phase)) {
    return (
      <div
        style={{
          maxWidth: 560,
          margin: '0 auto',
          textAlign: 'center',
          padding: 'var(--space-10) var(--space-4)',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>🏈</div>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text)', marginBottom: 'var(--space-2)' }}>
          Draft Not Available
        </div>
        <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          The NFL Draft opens during the offseason after Free Agency concludes.
          Come back once the season ends and player progression has run.
        </p>
      </div>
    );
  }

  const handleProgression = async () => {
    setProgressing(true);
    setError(null);
    try {
      const res = await actions.advanceOffseason();
      setProgressResult(res?.payload ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgressing(false);
    }
  };

  const handleStartDraft = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await actions.startDraft();
      if (res?.payload && !res.payload.notStarted) {
        onDraftStarted(res.payload);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 800,
          color: "var(--text)",
          marginBottom: "var(--space-6)",
        }}
      >
        Offseason Operations
      </h2>

      {error && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "rgba(255,69,58,0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-md)",
            color: "var(--danger)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--text-sm)",
          }}
        >
          {error}
        </div>
      )}

      {/* Step 1: Player Progression */}
      <Card className="card-premium" style={{ marginBottom: "var(--space-5)" }}>
        <CardContent style={{ padding: "var(--space-5)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-4)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                marginBottom: "var(--space-2)",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: progressionDone
                    ? "var(--success)"
                    : "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-xs)",
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {progressionDone ? "✓" : "1"}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  fontSize: "var(--text-sm)",
                }}
              >
                Player Progression &amp; Retirements
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                margin: 0,
                paddingLeft: 36,
              }}
            >
              Age every player by one year. Young players (&lt;26) develop;
              veterans (30+) decline. Players 34+ have a chance to retire.
            </p>
            {progressResult && (
              <div style={{ paddingLeft: 36, marginTop: "var(--space-3)" }}>
                <p
                  style={{
                    color: "var(--success)",
                    fontSize: "var(--text-xs)",
                    margin: 0,
                  }}
                >
                  {progressResult.message}
                </p>
                {progressResult.retired?.length > 0 && (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      maxHeight: 100,
                      overflowY: "auto",
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {progressResult.retired.map((r) => (
                      <span key={r.id} style={{ marginRight: 8 }}>
                        {r.name} ({r.pos}, Age {r.age})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button
            className="btn"
            disabled={progressing || progressionDone || disabled}
            onClick={handleProgression}
            style={{ flexShrink: 0, minWidth: 120 }}
          >
            {progressing
              ? "Processing…"
              : progressionDone
                ? "Completed"
                : "Run Progression"}
          </Button>
        </div>
        </CardContent>
      </Card>

      {/* FA waiting notice */}
      {phase === 'free_agency' && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--accent)11', border: '1px solid var(--accent)44', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Free Agency is in progress. Advance through all FA days to unlock the draft.
        </div>
      )}

      {/* Step 2: Start Draft */}
      <Card className="card-premium" style={{ opacity: isDraftPhase ? 1 : 0.55 }}>
        <CardContent style={{ padding: "var(--space-5)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-4)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                marginBottom: "var(--space-2)",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-xs)",
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                2
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  fontSize: "var(--text-sm)",
                }}
              >
                NFL Draft
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                margin: 0,
                paddingLeft: 36,
              }}
            >
              Generate a draft class of rookies (Age 21). Worst record picks
              first; Super Bowl winner picks last. 7 rounds.
            </p>
          </div>
          <Button
            className="btn btn-primary"
            disabled={!isDraftPhase || starting}
            onClick={handleStartDraft}
            style={{ flexShrink: 0, minWidth: 120 }}
            title={!isDraftPhase ? 'Available once Free Agency is complete' : undefined}
          >
            {starting ? "Starting…" : "Start Draft"}
          </Button>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
