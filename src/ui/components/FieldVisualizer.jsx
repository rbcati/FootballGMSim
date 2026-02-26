import React from 'react';

export default function FieldVisualizer({
  possession, // 'home' or 'away'
  ballOn,     // 0-100 (0 = home endzone, 100 = away endzone, 50 = midfield)
  yardsToGo,  // distance to first down
  down,       // 1-4
  lastPlay,   // text description of last play
  playType,   // 'pass', 'run', 'kick', etc. (for animation)
  isGoal      // boolean, true if last play was a score
}) {
  // Convert yard line (0-100) to percentage for CSS left/right
  // We'll assume the field is rendered horizontally, 0% is left (Home endzone), 100% is right (Away endzone).
  // Standard football field: 100 yards + 2 endzones (10 yards each).
  // Visualizer usually simplifies to just the 100 yards or 120 yards total.
  // Let's map 0-100 to 10%-90% of the container width to leave room for endzones.

  const fieldWidthPercent = 80; // 80% for playing field
  const endZoneWidthPercent = 10; // 10% each side

  // Calculate position percentage
  // ballOn is 0-100 relative to the field of play.
  // absolute position = 10% + (ballOn / 100 * 80%)
  const ballPositionPercent = 10 + (ballOn / 100 * fieldWidthPercent);

  // Marker for First Down
  // If possession is 'home' (moving left to right ->), target is ballOn + yardsToGo
  // If possession is 'away' (moving right to left <-), target is ballOn - yardsToGo
  let firstDownTarget = null;
  if (down && yardsToGo) {
    if (possession === 'home') {
      firstDownTarget = ballOn + yardsToGo;
    } else {
      firstDownTarget = ballOn - yardsToGo;
    }
    // Clamp to endzones
    if (firstDownTarget > 100) firstDownTarget = 100;
    if (firstDownTarget < 0) firstDownTarget = 0;
  }

  const firstDownPositionPercent = firstDownTarget !== null
    ? 10 + (firstDownTarget / 100 * fieldWidthPercent)
    : null;

  return (
    <div className="field-container" style={{
      position: 'relative',
      width: '100%',
      height: '160px',
      backgroundColor: '#2e7d32', // Grass green
      border: '2px solid #1b5e20',
      borderRadius: '8px',
      overflow: 'hidden',
      marginTop: '10px',
      marginBottom: '10px',
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)'
    }}>
      {/* Endzones */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '10%',
        backgroundColor: '#1b5e20', borderRight: '2px solid rgba(255,255,255,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', fontWeight: 'bold', writingMode: 'vertical-rl'
      }}>HOME</div>

      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '10%',
        backgroundColor: '#1b5e20', borderLeft: '2px solid rgba(255,255,255,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', fontWeight: 'bold', writingMode: 'vertical-rl'
      }}>AWAY</div>

      {/* Yard lines (every 10 yards = 8% width) */}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(yard => (
        <div key={yard} style={{
          position: 'absolute',
          left: `${10 + (yard / 100 * 80)}%`,
          top: 0, bottom: 0,
          borderLeft: '1px solid rgba(255,255,255,0.2)',
        }}>
           {yard % 20 === 0 && (
             <span style={{
               position: 'absolute', top: '5px', left: '-10px',
               color: 'rgba(255,255,255,0.5)', fontSize: '10px'
             }}>{yard > 50 ? 100 - yard : yard}</span>
           )}
        </div>
      ))}

      {/* Line of Scrimmage (Blue) */}
      <div style={{
        position: 'absolute',
        left: `${ballPositionPercent}%`,
        top: 0, bottom: 0,
        width: '2px',
        backgroundColor: '#2196f3',
        zIndex: 2,
        transition: 'left 0.5s ease-out'
      }} />

      {/* First Down Line (Yellow) */}
      {firstDownPositionPercent !== null && (
        <div style={{
          position: 'absolute',
          left: `${firstDownPositionPercent}%`,
          top: 0, bottom: 0,
          width: '2px',
          backgroundColor: '#ffeb3b',
          zIndex: 2,
          transition: 'left 0.5s ease-out'
        }} />
      )}

      {/* The Ball */}
      <div className={`ball ${playType === 'pass' ? 'pass-animation' : ''}`} style={{
        position: 'absolute',
        left: `${ballPositionPercent}%`,
        top: '50%',
        width: '12px', height: '8px',
        backgroundColor: '#795548', // Brown
        borderRadius: '50%',
        border: '1px solid #3e2723',
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        transition: 'left 0.8s cubic-bezier(0.25, 1, 0.5, 1)', // Smooth ease-out
      }} />

      {/* Event Overlay (Touchdown, etc) */}
      {isGoal && (
        <div className="game-event-overlay fade-in" style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff', padding: '10px 20px', borderRadius: '8px',
          fontWeight: 'bold', fontSize: '24px', zIndex: 20
        }}>
          TOUCHDOWN!
        </div>
      )}
    </div>
  );
}
