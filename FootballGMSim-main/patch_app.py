import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

# Add import
content = re.sub(
    r"(import LiveGame\s*from '\./components/LiveGame\.jsx';)",
    r"\1\nimport LiveGameViewer    from './components/LiveGameViewer.jsx';",
    content
)

# Extract states
content = re.sub(
    r"(batchSim,\s*\n\s*\} = state;)",
    r"\1\n    promptUserGame, userGameLogs,",
    content
)

# Add advancing logic check for prompt
content = re.sub(
    r"(const handleAdvanceWeek = useCallback\(\(options = \{\}\) => \{)",
    r"\1\n    if (promptUserGame) return;",
    content
)


# Modal & Viewer
app_end = """
      {/* ── User Game Prompt Modal ── */}
      {promptUserGame && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', zIndex: 10000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: 'var(--surface)', padding: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)', textAlign: 'center',
            border: '1px solid var(--hairline)', maxWidth: 400
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>Watch Your Game?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
              Your team has a game scheduled this week. Would you like to watch the play-by-play, or simulate the rest of the week?
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => actions.watchGame()}>
                Watch Game
              </button>
              <button className="btn" onClick={() => actions.advanceWeek({ skipUserGame: true })}>
                Simulate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Game Viewer ── */}
      {userGameLogs && (
        <LiveGameViewer
          logs={userGameLogs}
          homeTeam={league?.teams?.find(t => t.id === league.userTeamId) || { abbr: 'HOME' }} // Very rough mapping, could find actual teams but abbrs are in logs anyway
          awayTeam={league?.teams?.find(t => t.id !== league.userTeamId) || { abbr: 'AWAY' }}
          onComplete={() => {
              actions.clearUserGame();
              actions.advanceWeek({ skipUserGame: true });
          }}
        />
      )}
    </div>
  );
}
"""

content = re.sub(
    r"(    </div>\n  \);\n\})",
    app_end,
    content
)

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
