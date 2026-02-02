// live-game-viewer.js - Live game simulation with play-by-play and play calling
import { commitGameResult } from './game-simulator.js';
import soundManager from './sound-manager.js';
import { launchConfetti } from './confetti.js';

'use strict';

/**
 * Live Game Viewer - Allows users to watch and call plays during games
 */
class LiveGameViewer {
  constructor() {
    this.gameState = null;
    this.playByPlay = [];
    this.currentPlayIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isSkipping = false; // Added flag for skipping animations
    this.tempo = 'normal'; // 'hurry-up', 'normal', 'slow'
    this.playCallQueue = null; // User's play call
    this.intervalId = null;
    this.onPlayCallback = null;
    this.onGameEndCallback = null;
    this.modal = null;
    this.container = null;
    this.viewMode = false;
    this.hasAppliedResult = false;
    this.isGameEnded = false;
    this.isProcessingTurn = false;

    // Streak / Momentum state
    this.streak = 0; // Positive for user success, negative for failure (approx)
    this.combo = 0; // Combo counter for consecutive successes
  }

  /**
   * Stop the current game loop and cleanup
   */
  stopGame() {
    this.isPlaying = false;
    this.isPaused = true;
    if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
    }
    this.gameState = null;
    this.isGameEnded = true; // Prevent any pending callbacks
    this.clearTempState();
  }

  /**
   * Helper to check if UI is available
   */
  checkUI() {
    if (this.viewMode) {
      return this.container && document.body.contains(this.container);
    }
    return this.modal && document.body.contains(this.modal);
  }

  triggerShake() {
      const target = this.viewMode ? this.container : this.modal;
      if (target) {
          target.classList.remove('shake');
          void target.offsetWidth; // Force reflow
          target.classList.add('shake');
          setTimeout(() => target.classList.remove('shake'), 500);
      }
  }

  triggerFlash() {
      const flash = document.createElement('div');
      flash.className = 'flash-overlay';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 600);
  }

  triggerFloatText(text, type = '') {
      const el = document.createElement('div');
      el.className = `float-text ${type}`;
      el.textContent = text;
      el.style.left = '50%';
      el.style.top = '40%';
      el.style.marginLeft = `-${text.length * 10}px`; // Rough centering
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
  }

  /**
   * Render to a specific view container instead of modal
   */
  renderToView(containerId) {
    const container = document.querySelector(containerId);
    if (!container) return;

    this.viewMode = true;
    this.container = container;

    // Create layout
    const difficultyHtml = this.preGameContext?.difficulty ?
        `<div class="difficulty-badge" style="text-align: center; margin-bottom: 5px; font-size: 0.8em; color: var(--text-muted);">${this.preGameContext.difficulty}</div>` : '';

    container.innerHTML = `
      <div class="card live-game-header">
        ${difficultyHtml}
        <div class="scoreboard"></div>
        <div class="field-container"></div>
        <div class="field-wrapper" style="margin: 10px 0;"></div> <!-- Field Container -->
        <div class="control-bar">
            <button class="control-btn" id="btnPrevPlay" disabled>⏮ Prev</button>
            <div class="control-divider"></div>
            <button class="control-btn" id="btnPlayPause">⏯ Pause</button>
            <button class="control-btn" id="btnNextPlay">Next Play ⏭</button>
            <button class="control-btn" id="btnNextDrive">Next Drive ⏩</button>
            <div class="control-divider"></div>
            <div class="tempo-controls">
                <button class="control-btn" data-tempo="slow">Slow</button>
                <button class="control-btn active" data-tempo="normal">Normal</button>
                <button class="control-btn" data-tempo="hurry-up">Fast</button>
            </div>
            <div class="spacer"></div>
            <button class="control-btn" id="btnSkipEnd" style="color: var(--danger);">Skip to End</button>
        </div>
      </div>

      <div class="grid two">
        <div class="card live-game-log-card">
            <h3>Play-by-Play</h3>
            <div class="play-log-enhanced"></div>
        </div>
        <div>
            <div class="card">
                <h3>Game Stats</h3>
                <div class="game-dashboard live-game-dashboard">
                    <div class="box-score-panel"></div>
                    <div class="momentum-panel" style="margin-top: 10px;"></div>
                </div>
                <div class="stats-panel"></div>
            </div>
            <div class="card play-calling" style="display: none;">
                <!-- Play calling UI injected here -->
            </div>
        </div>
      </div>
    `;

    // Render Field
    this.renderField(container.querySelector('.field-wrapper'));

    // Attach listeners
    container.querySelector('#btnPlayPause').addEventListener('click', () => this.togglePause());
    container.querySelector('#btnNextPlay').addEventListener('click', () => {
        this.isPaused = true;
        this.displayNextPlay();
    });
    container.querySelector('#btnNextDrive').addEventListener('click', () => this.skipToNextDrive());
    container.querySelector('#btnSkipEnd').addEventListener('click', () => this.skipToEnd());

    container.querySelectorAll('[data-tempo]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            this.setTempo(e.target.dataset.tempo);
            container.querySelectorAll('[data-tempo]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Restore play history if available
    if (this.playByPlay && this.playByPlay.length > 0) {
        console.log('Restoring play history:', this.playByPlay.length, 'plays');

        // Optimize: Only render last 50 plays
        const startIdx = Math.max(0, this.playByPlay.length - 50);
        const playsToRender = this.playByPlay.slice(startIdx);

        // Add indicator if plays are hidden
        if (startIdx > 0) {
             const playLog = container.querySelector('.play-log-enhanced');
             if (playLog) {
                 const indicator = document.createElement('div');
                 indicator.className = 'play-item';
                 indicator.style.textAlign = 'center';
                 indicator.style.fontStyle = 'italic';
                 indicator.style.color = '#888';
                 indicator.textContent = `... ${startIdx} previous plays hidden ...`;
                 playLog.appendChild(indicator);
             }
        }

        playsToRender.forEach(play => {
            this.renderPlay(play);
        });

        const playLog = container.querySelector('.play-log-enhanced');
        if (playLog) {
            playLog.scrollTop = playLog.scrollHeight;
        }

        // Update field to last known state
        if (this.gameState) {
             const ballPos = this.gameState.ballPossession;
             const yardLine = this.gameState[ballPos].yardLine;
             this.updateFieldState(yardLine, ballPos === 'home');
        }
    }

    this.renderGame();
  }

  /**
   * Render the visual field
   */
  renderField(container) {
      if (!container) return;

      const homeName = this.gameState?.home?.team?.abbr || 'HOME';
      const awayName = this.gameState?.away?.team?.abbr || 'AWAY';
      const homeColor = this.gameState?.home?.team?.color || '#003366';
      const awayColor = this.gameState?.away?.team?.color || '#990000';

      container.innerHTML = `
        <div class="football-field-container">
           <div class="endzone left" style="background-color: ${homeColor}; opacity: 0.8;">${homeName}</div>
           <div class="field-background"></div>

           <!-- Yard Numbers (Every 10 yards) -->
           ${[10, 20, 30, 40, 50, 40, 30, 20, 10].map((num, i) =>
               `<div class="yard-marker" style="left: ${(10 + (i+1)*10) / 1.2}%">${num}</div>`
           ).join('')}

           <div class="marker-los" style="left: 50%;"></div>
           <div class="marker-first-down" style="left: 58.33%;"></div>

           <div class="player-markers">
               <div class="player-marker marker-qb"></div>
               <div class="player-marker marker-skill"></div>
           </div>

           <div class="football-ball" style="left: 50%;"></div>

           <div class="endzone right" style="background-color: ${awayColor}; opacity: 0.8;">${awayName}</div>
        </div>
      `;
  }

  /**
   * Update field markers instantly (no animation)
   */
  updateFieldState(yardLine, isHomePossession) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;
      const ballEl = parent.querySelector('.football-ball') || parent.querySelector('.ball');
      const losEl = parent.querySelector('.marker-los') || parent.querySelector('.field-marker.marker-los');
      const fdEl = parent.querySelector('.marker-first-down') || parent.querySelector('.field-marker.marker-first-down');

      if (!ballEl) return;

      // Calculate Visual Percentage (0-100% of container)
      // Total units = 120 (10 left EZ + 100 field + 10 right EZ)
      // Home drives Left -> Right (0 -> 100)
      // Away drives Right -> Left (100 -> 0)

      let visualYard = isHomePossession ? yardLine : (100 - yardLine);
      let pct = (10 + visualYard) / 1.2;

      ballEl.style.left = `${pct}%`;
      ballEl.style.transition = 'none';
      if (losEl) losEl.style.left = `${pct}%`;

      // First Down Marker
      const state = this.gameState;
      if (state) {
          const dist = state[isHomePossession ? 'home' : 'away'].distance;
          // Target yard line for 1st down
          let targetYard = yardLine + dist;
          if (targetYard > 100) targetYard = 100; // Goal line

          let visualTarget = isHomePossession ? targetYard : (100 - targetYard);
          let fdPct = (10 + visualTarget) / 1.2;
          if (fdEl) {
              fdEl.style.left = `${fdPct}%`;
              fdEl.style.display = 'block';
          }
      }

      // Hide players during instant update
      const qbMarker = parent.querySelector('.marker-qb');
      const skillMarker = parent.querySelector('.marker-skill');
      if (qbMarker) qbMarker.style.opacity = 0;
      if (skillMarker) skillMarker.style.opacity = 0;

      // Force reflow
      void ballEl.offsetWidth;
      ballEl.style.transition = ''; // Restore transition from CSS
  }

  /**
   * Helper to map yardline to visual percentage (0-100)
   */
  getVisualPercentage(yardLine, isHomePossession) {
      let visualYard = isHomePossession ? yardLine : (100 - yardLine);
      return (10 + visualYard) / 1.2;
  }

  /**
   * Physics-based animation helper
   */
  animateTrajectory(element, options) {
      return new Promise(resolve => {
          if (!element) return resolve();
          if (this.isSkipping) {
               element.style.left = `${options.endX}%`;
               if (options.arcHeight) element.style.transform = `translate(-50%, -50%)`;
               return resolve();
          }

          const startX = options.startX;
          const endX = options.endX;
          const duration = options.duration || 1000;
          const arcHeight = options.arcHeight || 0;

          const startTime = performance.now();

          // Easing functions
          const easeLinear = t => t;
          const easeOutQuad = t => t * (2 - t);
          const easeInOutQuad = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          const easing = options.easing === 'linear' ? easeLinear :
                         options.easing === 'easeOut' ? easeOutQuad : easeInOutQuad;

          const animate = (currentTime) => {
              if (this.isSkipping) {
                   element.style.left = `${endX}%`;
                   if (arcHeight) element.style.transform = `translate(-50%, -50%)`;
                   return resolve();
              }

              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeProgress = easing(progress);

              // X Position
              const currentX = startX + (endX - startX) * easeProgress;
              element.style.left = `${currentX}%`;

              // Y Position (Arc)
              if (arcHeight) {
                  // Parabola: y = 4 * h * x * (1 - x)
                  // We want negative Y (up)
                  const parabolicY = -4 * arcHeight * easeProgress * (1 - easeProgress);
                  element.style.transform = `translate(-50%, calc(-50% + ${parabolicY}px))`;
              }

              if (progress < 1) {
                  requestAnimationFrame(animate);
              } else {
                  element.style.left = `${endX}%`;
                  if (arcHeight) element.style.transform = `translate(-50%, -50%)`;
                  resolve();
              }
          };

          requestAnimationFrame(animate);
      });
  }

  /**
   * Animate the play on the field
   * @param {Object} play
   * @param {Object} startState
   * @returns {Promise}
   */
  async animatePlay(play, startState) {
      if (this.isSkipping || !this.checkUI()) {
          return Promise.resolve();
      }

      const parent = this.viewMode ? this.container : this.modal;
      const ballEl = parent.querySelector('.football-ball') || parent.querySelector('.ball');
      const qbMarker = parent.querySelector('.marker-qb');
      const skillMarker = parent.querySelector('.marker-skill');

      if (!ballEl) return Promise.resolve();

      // Duration Scaling
      let durationScale = 1;
      if (this.tempo === 'hurry-up') durationScale = 0.5;
      if (this.tempo === 'slow') durationScale = 2.0;

      const isHome = this.gameState.ballPossession === 'home';
      const startYard = startState ? startState.yardLine : play.yardLine;
      const endYard = startYard + play.yards; // Simplified end point

      // Visual Points
      const startPct = this.getVisualPercentage(startYard, isHome);
      let endPct = this.getVisualPercentage(Math.max(-5, Math.min(105, endYard)), isHome);

      // Reset Ball
      ballEl.style.transition = 'none';
      ballEl.style.left = `${startPct}%`;
      ballEl.style.transform = 'translate(-50%, -50%)';

      // Setup Markers (initially hidden or at start)
      if (qbMarker) {
          qbMarker.style.transition = 'none';
          qbMarker.style.left = `${startPct}%`;
          qbMarker.style.opacity = '1';
          qbMarker.style.backgroundColor = isHome ? '#007bff' : '#dc3545';
      }
      if (skillMarker) {
          skillMarker.style.transition = 'none';
          skillMarker.style.left = `${startPct}%`;
          skillMarker.style.opacity = '0'; // Hide initially
          skillMarker.style.backgroundColor = isHome ? '#007bff' : '#dc3545';
      }

      void ballEl.offsetWidth; // Reflow

      // --- PLAY TYPES ---

      if (play.playType.startsWith('pass')) {
          // PASS PLAY: Dropback -> Pass -> Catch/Run

          // 1. Dropback (QB moves back ~5 yards)
          // So Dropback is always yardLine - 5.
          const dropbackPct = this.getVisualPercentage(Math.max(0, startYard - 5), isHome);

          // Animate QB Dropback
          const dropbackDuration = 600 * durationScale;

          // Show Skill Player (Receiver) running route
          if (skillMarker) {
              skillMarker.style.opacity = '1';
              // Receiver starts at LOS, runs to catch point
              // Assume catch is at full yardage for simplicity
          }

          const p1 = this.animateTrajectory(qbMarker, {
              startX: startPct,
              endX: dropbackPct,
              duration: dropbackDuration,
              easing: 'easeOut'
          });

          const p2 = this.animateTrajectory(skillMarker, {
              startX: startPct,
              endX: endPct,
              duration: dropbackDuration + 400 * durationScale, // Route takes longer
              easing: 'easeInOut' // Run
          });

          // Ball tracks QB during dropback? Or just waits?
          // Let's snap ball to QB for dropback.
          const p3 = this.animateTrajectory(ballEl, {
              startX: startPct,
              endX: dropbackPct,
              duration: dropbackDuration,
              easing: 'easeOut'
          });

          await Promise.all([p1, p3]); // Wait for dropback

          // 2. Throw (Ball Arcs to Receiver)
          // QB stays, Receiver might still be moving slightly or arrived
          const throwDuration = 700 * durationScale; // Air time

          await this.animateTrajectory(ballEl, {
              startX: dropbackPct,
              endX: endPct,
              duration: throwDuration,
              arcHeight: 25, // Nice arc
              easing: 'linear' // Projectile X motion is linear-ish
          });

          // Pulse if TD
          if (play.result === 'touchdown') ballEl.classList.add('animate-pulse');

      } else if (play.playType.startsWith('run')) {
          // RUN PLAY: Handoff -> Run

          // 1. Handoff (Quick merge)
          const handoffDuration = 400 * durationScale;

          if (skillMarker) {
              skillMarker.style.opacity = '1';
              skillMarker.style.left = `${startPct}%`; // Starts at LOS
          }

          // QB hands off (small movement?)
          await new Promise(r => setTimeout(r, handoffDuration));

          // 2. Run
          const runDuration = 800 * durationScale;

          // QB fades
          if (qbMarker) qbMarker.style.opacity = '0.5';

          // Ball moves with Runner
          const pRun = this.animateTrajectory(ballEl, {
              startX: startPct,
              endX: endPct,
              duration: runDuration,
              easing: 'easeInOut'
          });

          const pSkill = this.animateTrajectory(skillMarker, {
              startX: startPct,
              endX: endPct,
              duration: runDuration,
              easing: 'easeInOut'
          });

          await Promise.all([pRun, pSkill]);

          if (play.result === 'touchdown') ballEl.classList.add('animate-pulse');

      } else if (play.playType === 'punt' || play.playType === 'field_goal') {
          // KICK
          const kickDuration = 1200 * durationScale;
          const arc = play.playType === 'punt' ? 40 : 30;

          // Hide markers
          if (qbMarker) qbMarker.style.opacity = 0;
          if (skillMarker) skillMarker.style.opacity = 0;

          await this.animateTrajectory(ballEl, {
              startX: startPct,
              endX: endPct,
              duration: kickDuration,
              arcHeight: arc,
              easing: 'linear'
          });

           if (play.result === 'touchdown' || play.result === 'field_goal') ballEl.classList.add('animate-pulse');

      } else {
          // Fallback (Penalty, etc)
          await this.animateTrajectory(ballEl, {
              startX: startPct,
              endX: endPct,
              duration: 1000 * durationScale
          });
      }

      // Cleanup
      setTimeout(() => {
          ballEl.classList.remove('animate-pulse');
          // Fade out markers
          if (qbMarker) qbMarker.style.opacity = 0;
          if (skillMarker) skillMarker.style.opacity = 0;
      }, 1000);

      return Promise.resolve();
  }

  /**
   * Initialize and show live game viewer
   * @param {Object} homeTeam - Home team object
   * @param {Object} awayTeam - Away team object
   * @param {number} userTeamId - ID of user's team (for play calling)
   * @param {boolean} autoStart - Whether to start playback immediately
   */
  initGame(homeTeam, awayTeam, userTeamId) {
    if (!homeTeam || !awayTeam) {
      console.error('Invalid teams for live game');
      return;
    }

    this.userTeamId = userTeamId;

    // Attempt to restore session
    if (this.restoreTempState(homeTeam.id, awayTeam.id)) {
        return;
    }

    // Capture Pre-Game Context
    if (userTeamId) {
        const league = window.state?.league;
        const isHome = homeTeam.id === userTeamId;
        const userTeam = isHome ? homeTeam : awayTeam;
        const oppTeam = isHome ? awayTeam : homeTeam;
        const plan = league?.weeklyGamePlan || {};

        // Get ratings (fallback to OVR if missing)
        const getRat = (t, type) => (t.ratings && t.ratings[type] ? t.ratings[type].overall : (t.ovr || 50));

        const userOff = getRat(userTeam, 'offense');
        const userDef = getRat(userTeam, 'defense');
        const oppOff = getRat(oppTeam, 'offense');
        const oppDef = getRat(oppTeam, 'defense');

        let matchupStr = null;

        const qb = userTeam.roster ? userTeam.roster.find(p => p.pos === 'QB') : null;
        const bestRB = userTeam.roster ? userTeam.roster.filter(p => p.pos === 'RB').sort((a,b) => (b.ovr||0) - (a.ovr||0))[0] : null;
        const passingStrength = (qb?.ovr || 0);
        const rushingStrength = (bestRB?.ovr || 0);

        if (userOff > oppDef + 3) {
             if (passingStrength >= rushingStrength) matchupStr = "Favorable matchup for Passing";
             else matchupStr = "Favorable matchup for Rushing";
        } else if (userOff < oppDef - 4) {
             matchupStr = "Tough matchup for Offense";
        }

        let stakesVal = 0;
        if (userTeam.rivalries && userTeam.rivalries[oppTeam.id]) {
            stakesVal = userTeam.rivalries[oppTeam.id].score;
        }

        // Calculate Difficulty Label
        const ovrDiff = (userTeam.ovr || 50) - (oppTeam.ovr || 50);
        let difficultyLabel = "Balanced Matchup";
        if (ovrDiff > 5) difficultyLabel = "Favorable Matchup (Easy)";
        else if (ovrDiff < -5) difficultyLabel = "Tough Matchup (Hard)";
        else if (ovrDiff < -10) difficultyLabel = "Nightmare Matchup (Very Hard)";

        this.preGameContext = {
            matchup: matchupStr,
            difficulty: difficultyLabel,
            offPlanId: plan.offPlanId,
            defPlanId: plan.defPlanId,
            riskId: plan.riskId,
            stakes: stakesVal,
            userIsHome: isHome
        };
    } else {
        this.preGameContext = null;
    }

    this.gameState = this.initializeGameState(homeTeam, awayTeam);
    this.playByPlay = [];
    this.currentPlayIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isSkipping = false;
    this.playCallQueue = null;
    this.hasAppliedResult = false;
    this.saveTempState();
  }

  /**
   * Start simulation loop
   */
  startSim() {
      this.simulateGame();
  }

  /**
   * Initialize game state
   */
  initializeGameState(homeTeam, awayTeam) {
    const homeQB = homeTeam.roster?.find(p => p.pos === 'QB');
    const awayQB = awayTeam.roster?.find(p => p.pos === 'QB');

    // Helper to get key players
    const getKeyPlayers = (team) => ({
        qb: team.roster?.find(p => p.pos === 'QB'),
        rbs: team.roster?.filter(p => p.pos === 'RB').sort((a,b) => (b.ovr||0) - (a.ovr||0)) || [],
        wrs: team.roster?.filter(p => p.pos === 'WR').sort((a,b) => (b.ovr||0) - (a.ovr||0)) || [],
        tes: team.roster?.filter(p => p.pos === 'TE').sort((a,b) => (b.ovr||0) - (a.ovr||0)) || [],
        k: team.roster?.find(p => p.pos === 'K')
    });

    const homePlayers = getKeyPlayers(homeTeam);
    const awayPlayers = getKeyPlayers(awayTeam);

    const initStats = () => ({
        players: {}, // Map player ID to stats
        team: {
            rushYds: 0, passYds: 0, totalYds: 0, turnovers: 0
        }
    });

    return {
      home: {
        team: homeTeam,
        score: 0,
        possession: true, // Home team starts with ball
        down: 1,
        distance: 10,
        yardLine: 25, // Start at own 25
        timeouts: 3,
        qb: homeQB,
        players: homePlayers
      },
      away: {
        team: awayTeam,
        score: 0,
        possession: false,
        down: 1,
        distance: 10,
        yardLine: 25,
        timeouts: 3,
        qb: awayQB,
        players: awayPlayers
      },
      quarter: 1,
      time: 900, // 15 minutes in seconds
      ballPossession: 'home', // 'home' or 'away'
      gameComplete: false,
      quarterScores: {
          home: [0, 0, 0, 0],
          away: [0, 0, 0, 0]
      },
      drive: {
          plays: 0,
          yards: 0,
          startTime: 900,
          startYardLine: 25
      },
      momentum: 0, // -100 (Away) to 100 (Home)
      stats: {
          home: initStats(),
          away: initStats()
      }
    };
  }

  /**
   * Simulate the entire game with play-by-play
   */
  simulateGame(autoStart = true) {
    const state = this.gameState;
    const C = window.Constants?.SIMULATION || {};
    const U = window.Utils;

    // Calculate team strengths
    const homeStrength = this.calculateTeamStrength(state.home.team);
    const awayStrength = this.calculateTeamStrength(state.away.team);
    const homeDefense = this.calculateDefenseStrength(state.home.team);
    const awayDefense = this.calculateDefenseStrength(state.away.team);

    // Generate target scores (for pacing)
    const HOME_ADVANTAGE = C.HOME_ADVANTAGE || 2.5;
    const strengthDiff = (homeStrength - awayStrength) + HOME_ADVANTAGE;
    const targetHomeScore = Math.max(0, 20 + Math.round(strengthDiff / 3) + U.rand(-7, 7));
    const targetAwayScore = Math.max(0, 20 - Math.round(strengthDiff / 3) + U.rand(-7, 7));

    this.simulationMeta = {
      targetHomeScore,
      targetAwayScore
    };

    // Start displaying plays if auto-start is enabled
    if (autoStart) {
        this.startPlayback();
    }
  }

  /**
   * Generate a single play
   */
  generatePlay(offense, defense, gameState, isUserTeam, targetHomeScore, targetAwayScore) {
    const U = window.Utils;

    // Determine play type (Offense)
    let playType = this.choosePlayType(offense, gameState);
    // Determine defense call (Defense)
    let defenseCall = 'defense_man';
    const isUserDefense = defense.team.id === this.userTeamId;

    // Apply user call if available
    if (this.playCallQueue) {
        if (this.playCallQueue.startsWith('defense_')) {
            if (isUserDefense) defenseCall = this.playCallQueue;
        } else {
            if (isUserTeam) playType = this.playCallQueue;
        }
        this.playCallQueue = null;
    }

    const offenseStrength = this.calculateOffenseStrength(offense.team);
    const defenseStrength = this.calculateDefenseStrength(defense.team);

    // Defense Modifiers
    let defModSack = 0;
    let defModRun = 0;
    let defModPass = 0;
    let defModBigPlay = 0;
    let defModInt = 0;

    if (defenseCall === 'defense_blitz') {
        defModSack = 0.10;
        defModRun = 2; // Vulnerable to run
        defModPass = -2; // Pressure
        defModBigPlay = 0.10; // High risk
    } else if (defenseCall === 'defense_zone') {
        defModPass = -3; // Coverage
        defModRun = -1; // Light box
        defModBigPlay = -0.05; // Safety
        defModInt = 0.02;
    }

    const successChance = Math.max(0.3, Math.min(0.7, 0.5 + (offenseStrength - defenseStrength) / 100));

    // Update Drive Info
    gameState.drive.plays++;

    // PLAYER SELECTION
    let player = null;

    // Helper to init player stats
    const ensureStats = (pid, name, pos, teamId) => {
        const teamStats = gameState.stats[teamId === gameState.home.team.id ? 'home' : 'away'];
        if (!teamStats.players[pid]) {
            teamStats.players[pid] = {
                name, pos,
                passAtt: 0, passComp: 0, passYds: 0, passTD: 0, passInt: 0,
                rushAtt: 0, rushYds: 0, rushTD: 0,
                recTargets: 0, rec: 0, recYds: 0, recTD: 0
            };
        }
        return teamStats.players[pid];
    };

    const play = {
      type: 'play',
      playType: playType,
      offense: offense.team.id,
      defense: defense.team.id,
      down: gameState[gameState.ballPossession].down,
      distance: gameState[gameState.ballPossession].distance,
      yardLine: gameState[gameState.ballPossession].yardLine,
      quarter: gameState.quarter,
      time: gameState.time,
      result: null, // Will be 'touchdown', 'turnover', 'sack', etc.
      yards: 0,
      message: ''
    };

    // Simulate play result
    const success = Math.random() < successChance;
    let yards = 0;
    let momentumChange = 0;

    // Normalize subtypes
    let baseType = playType;
    if (playType.startsWith('run_')) baseType = 'run';
    if (playType.startsWith('pass_')) baseType = 'pass';

    if (baseType === 'run') {
      // Pick RB
      const rbs = offense.players.rbs;
      const rb = rbs.length > 0 ? rbs[0] : null; // Simple depth chart: RB1
      player = rb || offense.qb;

      let runBonus = 0;
      let variance = 1;

      if (playType === 'run_inside') {
          runBonus = 1; variance = 0.5;
      } else if (playType === 'run_outside') {
          runBonus = -1; variance = 1.5;
      }

      if (success) {
        yards = Math.round(U.rand(2, 8) + runBonus + defModRun);
        if (Math.random() < (0.1 * variance + defModBigPlay)) {
            yards = U.rand(10, 25); // Big play
            momentumChange += 5;
            play.result = 'big_play';
        }
      } else {
        yards = U.rand(-2, 3);
        // Blitz TFL chance
        if (Math.random() < defModSack * 0.5) {
            yards -= 2;
            momentumChange -= 2;
        }
      }

      // Update Stats
      if (player) {
          const stats = ensureStats(player.id, player.name, player.pos, offense.team.id);
          stats.rushAtt++;
          stats.rushYds += yards;
      }

    } else if (baseType === 'pass') {
      // Pick Target
      const targets = [...offense.players.wrs, ...offense.players.tes];
      const target = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)] : null;
      player = target;
      const qb = offense.qb;

      // Update QB Stats (Attempts)
      if (qb) {
          const qbStats = ensureStats(qb.id, qb.name, qb.pos, offense.team.id);
          qbStats.passAtt++;
      }

      let completeBonus = 0;
      let yardBonus = 0;
      let intChance = 0.03;
      let bigPlayChance = 0.15;

      if (playType === 'pass_short') {
          completeBonus = 0.15; yardBonus = -2; intChance = 0.01; bigPlayChance = 0.05;
      } else if (playType === 'pass_medium') {
          completeBonus = 0; yardBonus = 0;
      } else if (playType === 'pass_long') {
          completeBonus = -0.15; yardBonus = 10; intChance = 0.07; bigPlayChance = 0.25;
      }

      // Check for Sack
      if (Math.random() < (0.05 + defModSack)) {
          yards = -U.rand(5, 10);
          play.result = 'sack';
          play.message = 'SACKED!';
          momentumChange -= 10;

          if (qb) {
             const qbStats = ensureStats(qb.id, qb.name, qb.pos, offense.team.id);
             qbStats.rushAtt++;
          }
      } else if (Math.random() < (successChance + completeBonus)) {
        // Completion
        yards = Math.max(1, Math.round(U.rand(5, 15) + yardBonus + defModPass));

        // Big play
        if (Math.random() < (bigPlayChance + defModBigPlay)) {
            yards = U.rand(20, 50);
            momentumChange += 10;
            play.result = 'big_play';
        }

        // Interception
        if (Math.random() < (intChance + defModInt)) {
          play.result = 'turnover'; // Standardize to turnover
          yards = 0;
          play.message = `${offense.qb?.name || 'QB'} pass intercepted!`;
          momentumChange -= 20;

          if (qb) {
             const qbStats = ensureStats(qb.id, qb.name, qb.pos, offense.team.id);
             qbStats.passInt++;
          }
        } else {
             // Successful Completion
             if (qb) {
                 const qbStats = ensureStats(qb.id, qb.name, qb.pos, offense.team.id);
                 qbStats.passComp++;
                 qbStats.passYds += yards;
             }
             if (target) {
                 const targetStats = ensureStats(target.id, target.name, target.pos, offense.team.id);
                 targetStats.rec++;
                 targetStats.recYds += yards;
                 targetStats.recTargets++;
             }
        }
      } else {
        yards = 0;
        play.result = 'incomplete';
        play.message = 'Incomplete pass';
        if (target) {
             const targetStats = ensureStats(target.id, target.name, target.pos, offense.team.id);
             targetStats.recTargets++;
        }
      }
    } else if (playType === 'field_goal') {
      const kicker = offense.players.k;
      const kickStrength = kicker?.ovr || 70;
      const distance = 100 - gameState[gameState.ballPossession].yardLine;
      const successChance = Math.max(0.3, Math.min(0.95, 0.9 - (distance - 20) / 30));
      
      if (Math.random() < successChance * (kickStrength / 100)) {
        play.result = 'field_goal';
        play.message = `Field goal is GOOD! (${distance} yards)`;
        offense.score += 3;

        // Update Quarter Score
        const qIdx = gameState.quarter - 1;
        if (gameState.quarterScores[gameState.ballPossession][qIdx] !== undefined) {
            gameState.quarterScores[gameState.ballPossession][qIdx] += 3;
        }
        momentumChange += 5;
        this.switchPossession(gameState);
      } else {
        play.result = 'field_goal_miss';
        play.message = `Field goal is NO GOOD (${distance} yards)`;
        momentumChange -= 10;
        this.switchPossession(gameState);
      }
    } else if (playType === 'punt') {
      yards = U.rand(35, 50);
      play.message = `Punt ${yards} yards`;
      this.switchPossession(gameState);
    }

    // Update Momentum
    gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? momentumChange : -momentumChange)));

    // Update yard line and down/distance
    if (play.result !== 'turnover' && play.result !== 'field_goal' && play.result !== 'field_goal_miss') {
      const newYardLine = gameState[gameState.ballPossession].yardLine + yards;
      gameState.drive.yards += yards;

      if (newYardLine >= 100) {
        // Touchdown!
        play.result = 'touchdown';
        play.message = `TOUCHDOWN! ${offense.team.name || offense.team.abbr}`;
        offense.score += 7;

        // Update Quarter Score
        const qIdx = gameState.quarter - 1;
        if (gameState.quarterScores[gameState.ballPossession][qIdx] !== undefined) {
            gameState.quarterScores[gameState.ballPossession][qIdx] += 7;
        }

        // Stats for TD
        if (baseType === 'run' && player) {
             const stats = ensureStats(player.id, player.name, player.pos, offense.team.id);
             stats.rushTD++;
        } else if (baseType === 'pass' && !play.result?.includes('turnover')) {
             if (offense.qb) {
                 const qbStats = ensureStats(offense.qb.id, offense.qb.name, offense.qb.pos, offense.team.id);
                 qbStats.passTD++;
             }
             if (player) {
                 const targetStats = ensureStats(player.id, player.name, player.pos, offense.team.id);
                 targetStats.recTD++;
             }
        }

        // Try for extra point (auto-success for now)
        offense.score += 1;
        if (gameState.quarterScores[gameState.ballPossession][qIdx] !== undefined) {
             gameState.quarterScores[gameState.ballPossession][qIdx] += 1;
        }

        momentumChange += 15;
        gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? 15 : -15)));

        // OT Rule: Touchdown ends game on first possession (or any possession if sudden death)
        if (gameState.isOvertime) {
            play.message += " (Game Winner!)";
            gameState.time = 0; // End game immediately
            gameState.gameComplete = true; // Force completion
        } else {
            this.switchPossession(gameState);
        }

      } else if (newYardLine <= 0) {
        // Safety
        play.result = 'safety';
        play.message = 'SAFETY!';
        defense.score += 2;

        // Update Defense Score (Quarter)
        const defPossession = gameState.ballPossession === 'home' ? 'away' : 'home';
        const qIdx = gameState.quarter - 1;
        if (gameState.quarterScores[defPossession][qIdx] !== undefined) {
             gameState.quarterScores[defPossession][qIdx] += 2;
        }

        momentumChange -= 20;
        gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? -20 : 20)));

        // OT Rule: Safety ends game
        if (gameState.isOvertime) {
             play.message += " (Game Winner!)";
             gameState.time = 0;
             gameState.gameComplete = true;
        } else {
             this.switchPossession(gameState);
        }

      } else {
        gameState[gameState.ballPossession].yardLine = newYardLine;
        gameState[gameState.ballPossession].distance -= yards;

        if (gameState[gameState.ballPossession].distance <= 0) {
          // First down
          gameState[gameState.ballPossession].down = 1;
          gameState[gameState.ballPossession].distance = 10;
          play.message = `First down! ${yards} yard${yards !== 1 ? 's' : ''} gained`;

          momentumChange += 2;
          gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? 2 : -2)));
        } else {
          gameState[gameState.ballPossession].down++;
          if (gameState[gameState.ballPossession].down > 4) {
            // Turnover on downs
            play.result = 'turnover_downs';
            play.message = 'Turnover on downs';
            momentumChange -= 10;
            gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? -10 : 10)));
            this.switchPossession(gameState);
          } else {
            play.message = `${yards >= 0 ? '+' : ''}${yards} yards. ${gameState[gameState.ballPossession].down} & ${gameState[gameState.ballPossession].distance}`;
          }
        }
      }
    }

    play.yards = yards;
    if (!play.message) {
      if (baseType === 'run') {
           play.message = `${player?.name || 'RB'} run for ${yards} yard${yards !== 1 ? 's' : ''}`;
      } else if (baseType === 'pass') {
           if (play.result === 'sack') {
               play.message = `${offense.qb?.name || 'QB'} SACKED for ${yards} yards!`;
           } else if (play.result === 'interception') {
               play.message = `INTERCEPTION! ${offense.qb?.name || 'QB'} picked off!`;
           } else if (play.result === 'incomplete') {
               play.message = `${offense.qb?.name || 'QB'} pass incomplete to ${player?.name || 'Receiver'}`;
           } else {
               play.message = `${offense.qb?.name || 'QB'} pass to ${player?.name || 'Receiver'} for ${yards} yards`;
           }
      } else {
           play.message = playType === 'run' ?
            `Run for ${yards} yard${yards !== 1 ? 's' : ''}` :
            `Pass for ${yards} yard${yards !== 1 ? 's' : ''}`;
      }
    }

    // Update game clock
    const timeOffClock = this.tempo === 'hurry-up' ? U.rand(15, 25) : 
                        this.tempo === 'slow' ? U.rand(35, 45) : 
                        U.rand(20, 35);
    gameState.time = Math.max(0, gameState.time - timeOffClock);

    return play;
  }

  /**
   * Choose play type (AI decision)
   */
  choosePlayType(offense, gameState) {
    const down = gameState[gameState.ballPossession].down;
    const distance = gameState[gameState.ballPossession].distance;
    const yardLine = gameState[gameState.ballPossession].yardLine;

    // 4th down logic
    if (down === 4) {
      if (yardLine >= 70 && yardLine <= 85) {
        // In field goal range
        return 'field_goal';
      } else if (yardLine < 50) {
        // Punt
        return 'punt';
      } else {
        // Go for it on 4th and short
        return distance <= 3 ? (Math.random() < 0.5 ? 'run' : 'pass') : 'punt';
      }
    }

    // Normal play selection
    let type = 'run';
    if (down === 1 || down === 2) {
      type = Math.random() < 0.6 ? 'pass' : 'run';
    } else {
      // 3rd down - more likely to pass
      type = Math.random() < 0.7 ? 'pass' : 'run';
    }

    // Add subtypes
    if (type === 'run') {
        return Math.random() < 0.6 ? 'run_inside' : 'run_outside';
    } else {
        const r = Math.random();
        if (r < 0.3) return 'pass_short';
        if (r < 0.7) return 'pass_medium';
        return 'pass_long';
    }
  }

  /**
   * Switch ball possession
   */
  switchPossession(gameState) {
    // Generate Drive Summary
    const drive = gameState.drive;
    const timeElapsed = Math.max(0, drive.startTime - gameState.time);
    const summary = `Drive Summary: ${drive.plays} plays, ${drive.yards} yards, ${this.formatTime(timeElapsed)}`;

    // Render Drive Summary
    this.renderPlay({
        type: 'drive_summary',
        message: summary
    });

    // Reset Drive Stats
    gameState.drive = {
        plays: 0,
        yards: 0,
        startTime: gameState.time,
        startYardLine: 25
    };

    gameState.ballPossession = gameState.ballPossession === 'home' ? 'away' : 'home';
    const newOffense = gameState[gameState.ballPossession];
    newOffense.down = 1;
    newOffense.distance = 10;
    newOffense.yardLine = 25; // Start at own 25 after kickoff/turnover
  }

  /**
   * Update game state after a play
   */
  updateGameState(play, gameState) {
    // State is updated within generatePlay
    // But we need to update the visual field markers for the NEXT play
    const ballPos = gameState.ballPossession;
    const yardLine = gameState[ballPos].yardLine;
    this.updateFieldState(yardLine, ballPos === 'home');
  }

  /**
   * Handle quarter and game transitions after the clock runs out
   */
  handleEndOfQuarter(gameState) {
    if (gameState.time > 0) {
      return;
    }

    if (gameState.quarter < 4) {
      gameState.quarter++;
      gameState.time = 900;
      const quarterPlay = {
        type: 'quarter_end',
        quarter: gameState.quarter - 1,
        message: `End of Q${gameState.quarter - 1}`
      };
      this.playByPlay.push(quarterPlay);
      this.renderPlay(quarterPlay);
    } else {
      // CHECK FOR TIE (OVERTIME)
      if (gameState.home.score === gameState.away.score && !gameState.gameComplete) {
          const isPlayoff = window.state?.league?.playoffs?.teams?.some(t => t.id === gameState.home.team.id) || false; // Approximation
          const allowTies = !isPlayoff && (typeof window !== 'undefined' ? window.state?.settings?.allowTies !== false : true);

          // Regular Season: Max 1 OT period (usually). We'll allow Q5.
          // If already in Q5 (OT) and tied, and allowTies is true, end game.
          if (gameState.quarter >= 5 && allowTies) {
              gameState.gameComplete = true;
              const finalPlay = {
                type: 'game_end',
                message: 'Game Over (Tie)',
                finalScore: { home: gameState.home.score, away: gameState.away.score }
              };
              this.playByPlay.push(finalPlay);
              this.renderPlay(finalPlay);
              return;
          }

          // Start OT
          gameState.quarter++;
          gameState.time = 600; // 10 min OT for reg season standard
          gameState.isOvertime = true;

          // Coin Toss
          const winner = Math.random() < 0.5 ? 'home' : 'away';
          gameState.ballPossession = winner;
          gameState.otFirstPossession = true;

          // Reset field
          const offense = gameState[winner];
          offense.down = 1;
          offense.distance = 10;
          offense.yardLine = 25;

          const otPlay = {
            type: 'quarter_end', // Reuse style
            quarter: 'OT',
            message: `End of Regulation. Overtime! ${winner.toUpperCase()} wins toss.`
          };
          this.playByPlay.push(otPlay);
          this.renderPlay(otPlay);

      } else {
          gameState.gameComplete = true;
          const finalPlay = {
            type: 'game_end',
            message: 'Game Over',
            finalScore: {
              home: gameState.home.score,
              away: gameState.away.score
            }
          };
          this.playByPlay.push(finalPlay);
          this.renderPlay(finalPlay);
      }
    }
  }

  /**
   * Calculate team offensive strength
   */
  calculateOffenseStrength(team) {
    if (!team?.roster) return 70;
    const offense = team.roster.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.pos));
    if (offense.length === 0) return 70;
    return offense.reduce((sum, p) => sum + (p.ovr || 50), 0) / offense.length;
  }

  /**
   * Calculate team defensive strength
   */
  calculateDefenseStrength(team) {
    if (!team?.roster) return 70;
    const defense = team.roster.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.pos));
    if (defense.length === 0) return 70;
    return defense.reduce((sum, p) => sum + (p.ovr || 50), 0) / defense.length;
  }

  /**
   * Calculate overall team strength
   */
  calculateTeamStrength(team) {
    if (!team?.roster || team.roster.length === 0) return 70;
    return team.roster.reduce((sum, p) => sum + (p.ovr || 50), 0) / team.roster.length;
  }

  /**
   * Start playback of plays
   */
  startPlayback() {
    this.isPlaying = true;
    this.isPaused = false;
    this.currentPlayIndex = 0;
    this.displayNextPlay();
  }

  /**
   * Display next play
   */
  async displayNextPlay() {
    if (this.isGameEnded) return;
    if (this.isProcessingTurn) return;

    if (this.gameState?.gameComplete) {
      this.endGame();
      return;
    }

    // CRITICAL FIX: If UI is missing, we must FINISH the game safely, not destroy it.
    if (!this.checkUI()) {
        console.warn('LiveGameViewer: UI missing, skipping to end to save state.');
        this.skipToEnd();
        return;
    }

    this.isProcessingTurn = true;
    this.updateControls();

    // Check if user needs to call a play
    const state = this.gameState;
    const offense = state.ballPossession === 'home' ? state.home : state.away;
    const defense = state.ballPossession === 'home' ? state.away : state.home;

    const isUserOffense = offense.team.id === this.userTeamId;
    const isUserDefense = defense.team.id === this.userTeamId;

    if ((isUserOffense || isUserDefense) && !this.playCallQueue) {
      // Show play calling interface
      this.showPlayCalling();
      return;
    }

    // Capture start state for animation
    const startState = {
        yardLine: this.gameState[this.gameState.ballPossession].yardLine,
        possession: this.gameState.ballPossession
    };

    const play = this.generatePlay(
      offense,
      defense,
      state,
      isUserOffense,
      this.simulationMeta?.targetHomeScore,
      this.simulationMeta?.targetAwayScore
    );

    // 1. Animate Play (Async)
    if (play.type === 'play' && (play.playType.startsWith('run') || play.playType.startsWith('pass') || play.playType === 'punt' || play.playType === 'field_goal')) {
        await this.animatePlay(play, startState);
        // RACE CHECK: If skipping or ended during animation, abort
        if (this.isGameEnded || this.isSkipping) {
            this.isProcessingTurn = false;
            return;
        }
    }

    this.playByPlay.push(play);
    this.currentPlayIndex = this.playByPlay.length;

    // ANIMATE!
    await this.animatePlay(play);
    // RACE CHECK
    if (this.isGameEnded || this.isSkipping) {
        this.isProcessingTurn = false;
        return;
    }

    this.renderPlay(play);
    this.updateGameState(play, state);

    // Ensure field markers are updated after state change
    this.updateField(state);

    this.handleEndOfQuarter(state);

    this.saveTempState();

    if (this.gameState.gameComplete) {
      this.endGame();
      return;
    }

    // Auto-advance
    // Reduce delay slightly since animation took time
    const delay = Math.max(500, this.getPlayDelay() - 1000);

    this.isProcessingTurn = false;
    this.updateControls();

    this.intervalId = setTimeout(() => {
      if (!this.isPaused) {
        this.displayNextPlay();
      }
    }, delay);
  }

  updateControls() {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;
      const btn = parent.querySelector('#btnNextPlay');
      if (btn) {
          btn.disabled = this.isProcessingTurn;
          btn.style.opacity = this.isProcessingTurn ? '0.5' : '1';
          btn.style.cursor = this.isProcessingTurn ? 'not-allowed' : 'pointer';
      }
  }

  /**
   * Get delay between plays based on tempo
   */
  getPlayDelay() {
    // Reduce delays slightly since animation takes time now
    switch (this.tempo) {
      case 'hurry-up': return 200; // was 800
      case 'slow': return 2000; // was 3000
      default: return 800; // was 1500
    }
  }

  /**
   * Trigger visual feedback for game events
   */
  triggerVisualFeedback(type, text) {
    if (!this.checkUI()) return;
    const parent = this.viewMode ? this.container : this.modal.querySelector('.modal-content');

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = `game-event-overlay ${type}`;
    overlay.innerHTML = `<div class="event-text">${text}</div>`;

    // Append to container (ensure relative positioning for parent if needed, though overlay is absolute)
    // In view mode, container is .card usually, which is relative?
    // .card has position: relative in CSS.
    // In modal mode, .modal-content needs position: relative?
    // .modal-content usually has no position set, default static.
    // Let's set position relative on parent if static.
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    parent.appendChild(overlay);

    // Remove after animation (1.5s)
    setTimeout(() => {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    }, 2000);
  }

  /**
   * Render a play to the UI
   */
  renderPlay(play) {
    if (!this.checkUI()) return; // Safety guard

    // Update Combo State
    if (this.userTeamId) {
        // Only track combo if it relates to user
        const isUserOffense = play.offense === this.userTeamId;
        const isUserDefense = play.defense === this.userTeamId;

        if (isUserOffense) {
            if (play.result === 'touchdown' || play.result === 'field_goal' || play.result === 'big_play' || (play.yards >= 10 && !play.result)) {
                this.combo++;
            } else if (play.result === 'turnover' || play.result === 'turnover_downs' || play.result === 'sack' || play.yards < 0) {
                this.combo = 0;
            }
        } else if (isUserDefense) {
            if (play.result === 'turnover' || play.result === 'turnover_downs' || play.result === 'sack' || play.yards <= 0) {
                this.combo++;
            } else if (play.result === 'touchdown' || play.result === 'field_goal' || play.result === 'big_play' || play.yards >= 10) {
                this.combo = 0;
            }
        }
    }

    // Sound & Juice Triggers
    if (!this.isSkipping) {
        if (play.result === 'touchdown') {
            soundManager.playTouchdown();
            soundManager.playCheer();
            this.triggerFlash();
            this.triggerFloatText('TOUCHDOWN!');
            launchConfetti();
            this.triggerVisualFeedback('positive', 'TOUCHDOWN!');
        } else if (play.result === 'turnover' || play.result === 'turnover_downs') {
            soundManager.playDefenseStop();
            soundManager.playFailure();
            // Intense shake
            if (this.container) this.container.classList.add('shake-hard');
            else if (this.modal) this.modal.querySelector('.modal-content').classList.add('shake-hard');
            soundManager.playTackle();
            this.triggerVisualFeedback('turnover', 'TURNOVER');
            // Screen shake
            if (this.container) this.container.classList.add('shake');
            else if (this.modal) this.modal.querySelector('.modal-content').classList.add('shake');
            setTimeout(() => {
                if (this.container) this.container.classList.remove('shake-hard');
                else if (this.modal) this.modal.querySelector('.modal-content').classList.remove('shake-hard');
            }, 500);

            this.triggerFloatText('TURNOVER!', 'bad');
            this.triggerVisualFeedback('negative', 'TURNOVER');
        } else if (play.result === 'field_goal_miss') {
            soundManager.playFailure();
            this.triggerShake();
            this.triggerFloatText('NO GOOD!', 'bad');
        } else if (play.result === 'sack') {
            soundManager.playBigHit();
            this.triggerShake();
            this.triggerFloatText('SACKED!', 'bad');
            this.triggerVisualFeedback('negative', 'SACK!');
        } else if (play.result === 'big_play') {
            soundManager.playCheer();
            this.triggerFloatText('BIG PLAY!');
        } else if (play.result === 'field_goal') {
            soundManager.playScore();
            soundManager.playKick();
            this.triggerFloatText('GOOD!');
            this.triggerVisualFeedback('positive', 'IT IS GOOD!');
        } else if (play.type === 'game_end') {
            // Check winner
            const userWon = (this.userTeamId && ((this.gameState.home.team.id === this.userTeamId && this.gameState.home.score > this.gameState.away.score) || (this.gameState.away.team.id === this.userTeamId && this.gameState.away.score > this.gameState.home.score)));
            if (userWon) {
                soundManager.playCheer();
                soundManager.playHorns();
                launchConfetti();
            } else {
                soundManager.playWhistle();
            }
             soundManager.playPing();
             this.triggerVisualFeedback('field-goal', 'IT IS GOOD!');
        } else if (play.result === 'field_goal_miss') {
             soundManager.playFailure();
             this.triggerVisualFeedback('negative', 'NO GOOD!');
        } else if (play.result === 'safety') {
             soundManager.playFailure();
             this.triggerVisualFeedback('safety', 'SAFETY!');
        } else if (play.type === 'quarter_end') {
            soundManager.playWhistle();
        }
    }

    const parent = this.viewMode ? this.container : this.modal;

    // Determine target log - view mode uses 'play-log-enhanced', modal uses 'play-log'
    const playLog = parent.querySelector(this.viewMode ? '.play-log-enhanced' : '.play-log');
    if (!playLog) return;

    const playElement = document.createElement('div');
    playElement.className = 'play-item';

    // Add specific classes based on result
    playElement.classList.add('slide-in'); // Animation entry

    if (play.result === 'touchdown') playElement.classList.add('play-touchdown');
    else if (play.result === 'turnover' || play.result === 'turnover_downs') playElement.classList.add('play-turnover');
    else if (play.result === 'sack') playElement.classList.add('play-sack');
    else if (play.result === 'big_play') playElement.classList.add('play-big-play');
    else if (play.result === 'field_goal') playElement.classList.add('play-field-goal');

    if (play.type === 'play') {
      const offense = this.gameState[this.gameState.ballPossession === 'home' ? 'home' : 'away'];

      // Determine Icon
      let icon = '🏈';
      if (play.playType.startsWith('run')) icon = '🏃';
      else if (play.playType.startsWith('pass')) icon = '🎯';
      else if (play.playType === 'field_goal') icon = '👟';
      else if (play.playType === 'punt') icon = '🦵';

      if (play.result === 'touchdown') icon = '🙌';
      else if (play.result === 'turnover' || play.result === 'turnover_downs') icon = '🛑';
      else if (play.result === 'sack') icon = '💥';

      playElement.innerHTML = `
        <div class="play-icon">${icon}</div>
        <div class="play-details">
            <div class="play-meta">Q${play.quarter} ${this.formatTime(play.time)} • ${play.down} & ${play.distance} at ${play.yardLine}</div>
            <div class="play-desc">${play.message}</div>
        </div>
      `;
    } else if (play.type === 'quarter_end') {
      playElement.className = 'play-item quarter-break';
      playElement.innerHTML = `<div class="play-message" style="width:100%; text-align:center;">${play.message}</div>`;
    } else if (play.type === 'game_end') {
      playElement.className = 'play-item game-end';
      playElement.innerHTML = `
        <div class="play-message" style="width:100%; text-align:center;">${play.message}</div>
        <div class="final-score" style="width:100%; text-align:center; font-weight:bold;">
          Final: ${this.gameState.away.team.name || this.gameState.away.team.abbr} ${play.finalScore.away} - 
          ${this.gameState.home.team.name || this.gameState.home.team.abbr} ${play.finalScore.home}
        </div>
      `;
    } else if (play.type === 'drive_summary') {
      playElement.className = 'play-item drive-summary';
      playElement.style.borderLeftColor = '#888';
      playElement.style.fontStyle = 'italic';
      playElement.style.fontSize = '0.9em';
      playElement.innerHTML = `<div class="play-message">📊 ${play.message}</div>`;
    }

    // Prepend to top if in view mode (newest first), otherwise append
    if (this.viewMode) {
        playLog.prepend(playElement);
    } else {
        playLog.appendChild(playElement);
        playLog.scrollTop = playLog.scrollHeight;
    }

    // Update scoreboard
    this.updateScoreboard();
  }

  /**
   * Trigger visual feedback overlay
   */
  triggerVisualFeedback(type, text) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;

      const overlay = document.createElement('div');
      overlay.className = `score-overlay ${type}`;
      overlay.textContent = text;

      // Append to relative parent
      const container = this.viewMode ? this.container : this.modal.querySelector('.modal-content');
      container.style.position = 'relative'; // Ensure positioning context
      container.appendChild(overlay);

      // Remove after animation
      setTimeout(() => {
          overlay.remove();
      }, 1500);
  }

  /**
   * Update scoreboard display
   */
  updateScoreboard() {
    if (!this.checkUI()) return; // Safety guard
    const parent = this.viewMode ? this.container : this.modal;

    const scoreboard = parent.querySelector('.scoreboard');
    if (!scoreboard || !this.gameState) return;

    const home = this.gameState.home;
    const away = this.gameState.away;
    const state = this.gameState;

    // Check for score changes for animation
    const oldHomeScore = parseInt(scoreboard.querySelector('.score-team:last-child .team-score')?.textContent || 0);
    const oldAwayScore = parseInt(scoreboard.querySelector('.score-team:first-child .team-score')?.textContent || 0);

    // Detect score change
    const homeChanged = this.lastHomeScore !== undefined && this.lastHomeScore !== home.score;
    const awayChanged = this.lastAwayScore !== undefined && this.lastAwayScore !== away.score;
    this.lastHomeScore = home.score;
    this.lastAwayScore = away.score;

    scoreboard.innerHTML = `
      <div class="score-team ${state.ballPossession === 'away' ? 'has-possession' : ''}">
        <div class="team-name">${away.team.abbr}</div>
        <div class="team-score ${awayChanged ? 'pulse-score' : ''}">${away.score}</div>
      </div>
      <div class="score-info">
        <div class="game-clock">Q${state.quarter} ${this.formatTime(state.time)}</div>
        <div class="down-distance">
          ${state[state.ballPossession].down} & ${state[state.ballPossession].distance} at ${state[state.ballPossession].yardLine}
        </div>
      </div>
      <div class="score-team ${state.ballPossession === 'home' ? 'has-possession' : ''}">
        <div class="team-name">${home.team.abbr}</div>
        <div class="team-score ${homeChanged ? 'pulse-score' : ''}">${home.score}</div>
      </div>
    `;

    // Remove flash classes after animation completes (if using pure CSS animation, this might not be strictly necessary if we re-render often, but good practice)
    // Actually, since we re-render scoreboard on every play/tick, the class will be removed on next render if score doesn't change again.
  }

  /**
   * Animate the play
   */
  async animatePlay(play, startState) {
      if (this.isSkipping || !this.checkUI()) return Promise.resolve();

      const parent = this.viewMode ? this.container : this.modal;
      const ball = parent.querySelector('.ball');
      if (!ball) return Promise.resolve();

      // Determine duration based on tempo
      let duration = 1000;
      if (this.tempo === 'hurry-up') duration = 500;
      if (this.tempo === 'slow') duration = 2000;

      // Special animations for play types
      if (play.playType === 'field_goal' || play.playType === 'punt') {
          ball.classList.add('animate-kick');
          duration = 1500; // Match CSS animation duration
      } else if (play.playType.startsWith('pass')) {
          ball.classList.add('animate-pass');
      }

      // Current State (Start)
      const startYard = startState ? startState.yardLine : this.gameState[this.gameState.ballPossession].yardLine;
      const endYard = startYard + play.yards;

      // Apply Start Position immediately (no transition)
      ball.style.transition = 'none';
      ball.style.left = `${startYard}%`;

      // Force Reflow
      void ball.offsetWidth;

      // Apply End Position with transition
      ball.style.transition = `left ${duration}ms ease-in-out`;
      ball.style.left = `${Math.max(0, Math.min(100, endYard))}%`;

      // Wait for animation to finish
      return new Promise(resolve => {
          setTimeout(() => {
              // Cleanup animation classes
              ball.classList.remove('animate-kick');
              ball.classList.remove('animate-pass');
              resolve();
          }, duration);
      });
  }

  /**
   * Format time in MM:SS
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Show play calling interface
   */
  showPlayCalling() {
    if (!this.checkUI()) return;
    const parent = this.viewMode ? this.container : this.modal;

    // Check if we need to inject the buttons for view mode
    if (this.viewMode) {
        const pcContainer = parent.querySelector('.play-calling');
        // Check if buttons exist, ignoring whitespace/comments
        if (pcContainer && !pcContainer.querySelector('.play-call-buttons')) {
            pcContainer.innerHTML = `
                <div class="play-call-prompt">Call Your Play:</div>
                <div class="play-call-buttons">
                    <div class="play-row">
                        <button class="play-call-btn" data-play="run_inside">Run Inside</button>
                        <button class="play-call-btn" data-play="run_outside">Run Outside</button>
                    </div>
                    <div class="play-row">
                        <button class="play-call-btn" data-play="pass_short">Short Pass</button>
                        <button class="play-call-btn" data-play="pass_medium">Med Pass</button>
                        <button class="play-call-btn" data-play="pass_long">Long Pass</button>
                    </div>
                    <div class="play-row">
                        <button class="play-call-btn" data-play="field_goal">Field Goal</button>
                        <button class="play-call-btn" data-play="punt">Punt</button>
                    </div>
                    <div class="play-row defense-row">
                        <button class="play-call-btn" data-play="defense_blitz">Blitz</button>
                        <button class="play-call-btn" data-play="defense_man">Man Coverage</button>
                        <button class="play-call-btn" data-play="defense_zone">Zone Coverage</button>
                    </div>
                </div>
            `;
            // Attach events
            pcContainer.querySelectorAll('.play-call-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Visual feedback
                    pcContainer.querySelectorAll('.play-call-btn').forEach(b => b.classList.remove('selected'));
                    e.target.classList.add('selected');

                    // Small delay to show feedback before hiding
                    setTimeout(() => {
                        this.callPlay(e.target.dataset.play);
                    }, 150);
                });
            });
        }
    }

    const playCalling = parent.querySelector('.play-calling');
    if (!playCalling) return;

    playCalling.style.display = 'flex';
    this.isPaused = true;

    // Toggle buttons based on possession
    const state = this.gameState;
    const offense = state.ballPossession === 'home' ? state.home : state.away;
    const isUserOffense = offense.team.id === this.userTeamId;

    const offRows = playCalling.querySelectorAll('.play-row:not(.defense-row)');
    const defRow = playCalling.querySelector('.defense-row');

    if (isUserOffense) {
        offRows.forEach(r => r.style.display = 'flex');
        if (defRow) defRow.style.display = 'none';
        const prompt = playCalling.querySelector('.play-call-prompt');
        if(prompt) prompt.textContent = 'Call Offense:';
    } else {
        offRows.forEach(r => r.style.display = 'none');
        if (defRow) defRow.style.display = 'flex';
        const prompt = playCalling.querySelector('.play-call-prompt');
        if(prompt) prompt.textContent = 'Call Defense:';
    }

    // Clear any existing timeout
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }
  }

  /**
   * Hide play calling interface
   */
  hidePlayCalling() {
    if (!this.checkUI()) return;
    const parent = this.viewMode ? this.container : this.modal;

    const playCalling = parent.querySelector('.play-calling');
    if (playCalling) {
      playCalling.style.display = 'none';
    }
    this.isPaused = false;
  }

  /**
   * User calls a play
   */
  callPlay(playType) {
    this.playCallQueue = playType;
    this.hidePlayCalling();
    
    // Continue game
    if (this.isPlaying) {
      this.displayNextPlay();
    }
  }

  /**
   * Skip to end of game
   * CRITICAL FIX: Ensure simulation completes and SAVES first, then update UI if available.
   */
  skipToEnd() {
      // Set skipping flag IMMEDIATELY to short-circuit any running animations
      this.isSkipping = true;

      if (this.intervalId) {
          clearTimeout(this.intervalId);
          this.intervalId = null;
      }
      if (this.isGameEnded) return;

      this.isPaused = false;
      this.isPlaying = true;

      // SAFETY BREAK: Max 500 loops to prevent freeze, but usually enough for a game
      let playsSimulated = 0;

      while (!this.gameState.gameComplete && playsSimulated < 500) {
          playsSimulated++;
          const state = this.gameState;
          const offense = state.ballPossession === 'home' ? state.home : state.away;
          const defense = state.ballPossession === 'home' ? state.away : state.home;
          const isUserOffense = offense.team.id === this.userTeamId;

          // Auto-pick for user (AI)
          const play = this.generatePlay(offense, defense, state, isUserOffense, null, null);

          this.playByPlay.push(play);
          // Only render if skipping is slow or we want logs, but for speed we skip rendering intermediate plays
          // However, we DO update the state
          this.updateGameState(play, state);
          this.handleEndOfQuarter(state);
      }

      this.isSkipping = false;

      // 1. SAVE FIRST (Persistence)
      this.finalizeGame();

      // 2. Update UI if it exists (Safe DOM Access)
      if (this.checkUI()) {
          this.renderGame();
          // Scroll log to bottom safely
          const parent = this.viewMode ? this.container : this.modal;
          if (parent) {
             const playLog = parent.querySelector(this.viewMode ? '.play-log-enhanced' : '.play-log');
             if (playLog) playLog.scrollTop = playLog.scrollHeight;
          }
      }

      // 3. Cleanup
      this.endGame();
  }

  /**
   * Set game tempo
   */
  setTempo(tempo) {
    this.tempo = tempo;
    if (!this.checkUI()) return;
    const parent = this.viewMode ? this.container : this.modal;

    // Support both new control-btn and old tempo-btn classes
    const selector = this.viewMode ? `button[data-tempo="${tempo}"]` : `.tempo-btn[data-tempo="${tempo}"]`;
    const btn = parent.querySelector(selector);

    if (btn) {
      const allBtns = this.viewMode ? parent.querySelectorAll('button[data-tempo]') : parent.querySelectorAll('.tempo-btn');
      allBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  /**
   * Pause/Resume game
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    if (!this.checkUI()) return;
    const parent = this.viewMode ? this.container : this.modal;

    // Support both new control-btn and old pause-btn
    const btn = this.viewMode ? parent.querySelector('#btnPlayPause') : parent.querySelector('.pause-btn');

    if (btn) {
      btn.textContent = this.isPaused ? '▶ Resume' : '⏸ Pause';
    }

    if (!this.isPaused && this.isPlaying) {
      this.displayNextPlay();
    }
  }

  /**
   * End game
   */
  endGame() {
    if (this.isGameEnded) {
        // Double check save if called redundantly
        this.finalizeGame();
        return;
    }
    this.isGameEnded = true;

    this.isPlaying = false;
    this.isPaused = true;

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    // Enhanced Game Over Screen
    if (this.checkUI() && !this.isSkipping) {
        const userTeam = this.userTeamId ? (this.gameState.home.team.id === this.userTeamId ? this.gameState.home : this.gameState.away) : null;

        // Only show overlay if user is playing
        if (userTeam) {
             const isHome = this.gameState.home.team.id === this.userTeamId;
             const userScore = isHome ? this.gameState.home.score : this.gameState.away.score;
             const oppScore = isHome ? this.gameState.away.score : this.gameState.home.score;

             if (userScore > oppScore) {
                 soundManager.playCheer();
                 if (soundManager.playHorns) soundManager.playHorns();
                 launchConfetti();
                 this.showGameOverOverlay('VICTORY', userScore, oppScore, 'positive');
             } else if (userScore < oppScore) {
                  this.showGameOverOverlay('DEFEAT', userScore, oppScore, 'negative');
             } else {
                  this.showGameOverOverlay('DRAW', userScore, oppScore, 'neutral');
             }
        }
    }

    // Show final stats safely
    if (this.checkUI()) {
        const parent = this.viewMode ? this.container : this.modal;
        const finalStats = parent.querySelector('.final-stats');
        if (finalStats) {
            finalStats.style.display = 'block';
        }
    }

    if (this.onGameEndCallback) {
      this.onGameEndCallback(this.gameState);
    }

    // ENSURE SAVE
    this.finalizeGame();
    this.clearTempState();
  }

  showGameOverOverlay(title, scoreA, scoreB, type) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal.querySelector('.modal-content');
      if (!parent) return;

      // Calculate MVP (Player with most yards or TDs)
      let mvp = null;
      let mvpScore = -1;
      const stats = this.gameState.stats;
      const allPlayers = { ...stats.home.players, ...stats.away.players };

      Object.values(allPlayers).forEach(p => {
          let score = 0;
          score += (p.passYds || 0) * 0.04;
          score += (p.rushYds || 0) * 0.1;
          score += (p.recYds || 0) * 0.1;
          score += (p.passTD || 0) * 4;
          score += (p.rushTD || 0) * 6;
          score += (p.recTD || 0) * 6;

          if (score > mvpScore) {
              mvpScore = score;
              mvp = p;
          }
      });

      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';

      let bannerClass = 'game-over-banner';
      if (type === 'positive') bannerClass += ' victory';
      if (type === 'negative') bannerClass += ' defeat';

      overlay.innerHTML = `
        <div class="${bannerClass}">
            <h2>${title}</h2>
            <div class="game-over-score">${scoreA} - ${scoreB}</div>

            ${mvp ? `
            <div class="game-over-mvp">
                <div class="label">Player of the Game</div>
                <div class="player-name">${mvp.name}</div>
                <div class="player-stats">
                    ${mvp.pos} •
                    ${mvp.passYds ? mvp.passYds + ' Pass Yds, ' : ''}
                    ${mvp.rushYds ? mvp.rushYds + ' Rush Yds, ' : ''}
                    ${mvp.recYds ? mvp.recYds + ' Rec Yds, ' : ''}
                    ${(mvp.passTD || mvp.rushTD || mvp.recTD) ? (mvp.passTD||0)+(mvp.rushTD||0)+(mvp.recTD||0) + ' TDs' : ''}
                </div>
            </div>
            ` : ''}

            <div style="margin-top: 30px;">
                <button class="btn primary" id="dismissOverlay" style="font-size: 1.2rem; padding: 10px 30px;">Continue</button>
            </div>
        </div>
      `;

      // Ensure positioning
      if (getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
      }

      parent.appendChild(overlay);

      overlay.querySelector('#dismissOverlay').addEventListener('click', () => {
          overlay.remove();
      });
  }

  /**
   * Finalize the game result using the unified pathway
   */
  finalizeGame() {
    if (this.hasAppliedResult) return;
    this.hasAppliedResult = true;

    if (typeof window.saveGameState !== 'function') {
        console.warn("Save system not available");
    }

    const L = window.state?.league;
    if (!L) return;

    // Add safeguards for gameState null
    if (!this.gameState || !this.gameState.home) {
        console.error("Cannot finalize game: Invalid gameState");
        return;
    }

    const gameData = {
        homeTeamId: this.gameState.home.team.id,
        awayTeamId: this.gameState.away.team.id,
        homeScore: this.gameState.home.score,
        awayScore: this.gameState.away.score,
        stats: this.gameState.stats, // Pass stats for accumulation
        preGameContext: this.preGameContext // PASS CONTEXT
    };

    try {
        const result = commitGameResult(L, gameData);

        if (result) {
            console.log("Game finalized successfully:", result);
            // saveState is now called within commitGameResult
            if (window.setStatus) window.setStatus("Game Saved!", "success");
        } else {
            console.error("Failed to finalize game: Result was null");
            if (window.setStatus) window.setStatus("Error: Could not save game result. Please try again.", "error");
            this.hasAppliedResult = false;
        }
    } catch (e) {
        console.error("Exception in finalizeGame:", e);
        if (window.setStatus) window.setStatus("CRITICAL ERROR SAVING GAME", "error");
    }
  }

  /**
   * Create modal UI
   */
  createModal() {
    // Remove existing modal if any
    const existing = document.getElementById('liveGameModal');
    if (existing) {
      existing.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'liveGameModal';
    modal.className = 'modal live-game-modal';
    modal.hidden = true;

    modal.innerHTML = `
      <div class="modal-content live-game-content">
        <div class="modal-header">
          <h2>Live Game</h2>
          <button type="button" class="close" aria-label="Close modal">&times;</button>
        </div>
        
        <div class="scoreboard"></div>
        <div class="field-wrapper" style="margin: 10px; padding: 0 10px;"></div> <!-- Field -->
        
        <div class="field-container" style="margin: 0 var(--space-4);"></div>

        <div class="game-controls">
          <button class="tempo-btn active" data-tempo="normal">Normal</button>
          <button class="tempo-btn" data-tempo="hurry-up">Hurry-Up</button>
          <button class="tempo-btn" data-tempo="slow">Slow</button>
          <button class="pause-btn">⏸ Pause</button>
          <button class="skip-btn" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Skip to End</button>
        </div>

        <div class="game-dashboard" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; background: rgba(0,0,0,0.2); margin-top: 10px; border-radius: 8px;">
            <div class="box-score-panel"></div>
            <div class="momentum-panel"></div>
        </div>
        <div class="stats-panel" style="padding: 10px; font-size: 0.8em; overflow-x: auto; background: rgba(0,0,0,0.1); margin-top: 10px; border-radius: 8px;"></div>

        <div class="play-calling" style="display: none;">
          <div class="play-call-prompt">Call Your Play:</div>
          <div class="play-call-buttons">
            <div class="play-row">
                <span>RUN</span>
                <button class="play-call-btn" data-play="run_inside">Inside</button>
                <button class="play-call-btn" data-play="run_outside">Outside</button>
            </div>
            <div class="play-row">
                <span>PASS</span>
                <button class="play-call-btn" data-play="pass_short">Short</button>
                <button class="play-call-btn" data-play="pass_medium">Med</button>
                <button class="play-call-btn" data-play="pass_long">Long</button>
            </div>
            <div class="play-row">
                <span>ST</span>
                <button class="play-call-btn" data-play="field_goal">FG</button>
                <button class="play-call-btn" data-play="punt">Punt</button>
            </div>
            <div class="play-row defense-row">
                <span>DEF</span>
                <button class="play-call-btn" data-play="defense_blitz">Blitz</button>
                <button class="play-call-btn" data-play="defense_man">Man</button>
                <button class="play-call-btn" data-play="defense_zone">Zone</button>
            </div>
          </div>
        </div>

        <div class="play-log"></div>

        <div class="final-stats" style="display: none;">
          <h3>Game Complete!</h3>
          <button class="close-game-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modal = modal;

    // Render Field
    this.renderField(modal.querySelector('.field-wrapper'));

    // Event listeners
    modal.querySelector('.close').addEventListener('click', () => this.hideModal());
    modal.querySelectorAll('.tempo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setTempo(e.target.dataset.tempo);
      });
    });
    modal.querySelector('.pause-btn').addEventListener('click', () => this.togglePause());
    modal.querySelector('.skip-btn').addEventListener('click', () => this.skipToEnd());
    modal.querySelectorAll('.play-call-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Visual feedback
        modal.querySelectorAll('.play-call-btn').forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');

        setTimeout(() => {
             this.callPlay(e.target.dataset.play);
        }, 150);
      });
    });
    modal.querySelector('.close-game-btn')?.addEventListener('click', () => this.hideModal());

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideModal();
      }
    });
  }

  /**
   * Render Field
   */
  renderField() {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;
      const fieldContainer = parent.querySelector('.field-container');
      if (!fieldContainer) return;

      fieldContainer.innerHTML = `
          <div class="end-zone" style="left: 0; background: rgba(0,0,100,0.3); border-right: 2px solid white; display: none;"></div>
          <div class="end-zone" style="right: 0; background: rgba(0,0,100,0.3); border-left: 2px solid white; display: none;"></div>
          <div class="field-marker marker-los" style="left: 50%;"></div>
          <div class="field-marker marker-first-down" style="left: 60%;"></div>

          <div class="player-markers">
              <div class="player-marker marker-qb"></div>
              <div class="player-marker marker-skill"></div>
          </div>

          <div class="ball" style="left: 50%;"></div>
      `;
  }

  /**
   * Update Field Visualization
   */
  updateField(state) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;

      const losMarker = parent.querySelector('.marker-los');
      const fdMarker = parent.querySelector('.marker-first-down');
      const ball = parent.querySelector('.ball');
      const fieldContainer = parent.querySelector('.field-container');

      if (!losMarker || !fdMarker || !ball || !state) return;

      const currentPossession = state[state.ballPossession];
      const yardLine = currentPossession.yardLine;
      const distance = currentPossession.distance;

      // 0 = Goal Line (Own), 100 = Goal Line (Opponent)
      // Map 0-100 yards to 0-100% width

      const losPct = yardLine;
      const fdPct = Math.min(100, yardLine + distance);

      losMarker.style.left = `${losPct}%`;
      fdMarker.style.left = `${fdPct}%`;
      ball.style.left = `${losPct}%`;

      // Hide First Down marker if Goal to Go
      if (yardLine + distance >= 100) {
          fdMarker.style.display = 'none';
      } else {
          fdMarker.style.display = 'block';
      }

      // Red Zone Visualization
      // Home drives 0->100 (RZ > 80), Away drives 100->0 (RZ < 20)
      const isRedZone = (state.ballPossession === 'home' && yardLine >= 80) ||
                        (state.ballPossession === 'away' && yardLine <= 20);

      if (fieldContainer) {
          if (isRedZone) fieldContainer.classList.add('red-zone');
          else fieldContainer.classList.remove('red-zone');
      }
  }

  /**
   * Render game UI
   */
  renderGame() {
    if (!this.checkUI()) return;
    if (!this.gameState) return;

    // Ensure field is rendered if empty
    const parent = this.viewMode ? this.container : this.modal;
    const field = parent.querySelector('.field-container');
    if (field && !field.hasChildNodes()) {
        this.renderField();
    }

    this.updateScoreboard();
    this.updateField(this.gameState);
    this.renderBoxScore();
    this.renderMomentum();
    this.renderGameStats();
  }

  /**
   * Render Box Score
   */
  renderBoxScore() {
      if (!this.checkUI()) return;
      if (!this.gameState) return;
      const parent = this.viewMode ? this.container : this.modal;

      const container = parent.querySelector('.box-score-panel');
      if (!container) return;

      const home = this.gameState.home;
      const away = this.gameState.away;
      const qH = this.gameState.quarterScores.home;
      const qA = this.gameState.quarterScores.away;

      container.innerHTML = `
        <table class="box-score-table" style="width:100%; font-size: 0.8em; color: var(--text);">
            <thead><tr><th style="text-align:left;">Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>T</th></tr></thead>
            <tbody>
                <tr>
                    <td>${away.team.abbr}</td>
                    <td>${qA[0]}</td><td>${qA[1]}</td><td>${qA[2]}</td><td>${qA[3]}</td>
                    <td><b>${away.score}</b></td>
                </tr>
                <tr>
                    <td>${home.team.abbr}</td>
                    <td>${qH[0]}</td><td>${qH[1]}</td><td>${qH[2]}</td><td>${qH[3]}</td>
                    <td><b>${home.score}</b></td>
                </tr>
            </tbody>
        </table>
      `;
  }

  /**
   * Render Momentum
   */
  renderMomentum() {
      if (!this.checkUI()) return;
      if (!this.gameState) return;
      const parent = this.viewMode ? this.container : this.modal;

      const container = parent.querySelector('.momentum-panel');
      if (!container) return;

      const m = this.gameState.momentum;
      const pct = (m + 100) / 2;

      // Streak indicator
      let streakHtml = '';
      if (this.streak >= 3) {
          streakHtml = `<div class="streak-fire" style="text-align:center; font-weight:bold; font-size: 0.8em; margin-top: 4px;">🔥 ON FIRE! 🔥</div>`;
      }
      // Combo indicator
      if (this.combo >= 2) {
          streakHtml += `<div class="streak-text" style="text-align:center; margin-top: 2px;">COMBO x${this.combo}</div>`;
      }

      container.innerHTML = `
        <div style="text-align: center; font-size: 0.8em; margin-bottom: 4px; color: var(--text-muted);">Momentum</div>
        <div class="${Math.abs(m) > 75 ? 'momentum-surge' : ''}" style="height: 10px; background: #333; border-radius: 5px; position: relative; overflow: hidden;">
            <div style="position: absolute; top:0; bottom:0; left: ${pct}%; width: 2px; background: white; z-index: 2;"></div>
            <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #dc3545 0%, #007bff 100%); opacity: 0.8;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.7em; color: var(--text-muted);">
            <span>${this.gameState.away.team.abbr}</span>
            <span>${this.gameState.home.team.abbr}</span>
        </div>
        ${streakHtml}
      `;
  }

  /**
   * Render Game Stats
   */
  renderGameStats() {
      if (!this.checkUI()) return;
      if (!this.gameState) return;
      const parent = this.viewMode ? this.container : this.modal;

      const container = parent.querySelector('.stats-panel');
      if (!container) return;

      const getTopStats = (teamKey) => {
          const stats = this.gameState.stats[teamKey].players;
          const players = Object.values(stats);

          const passer = players.filter(p => p.passAtt > 0).sort((a,b) => b.passYds - a.passYds)[0];
          const rusher = players.filter(p => p.rushAtt > 0).sort((a,b) => b.rushYds - a.rushYds)[0];
          const receiver = players.filter(p => p.rec > 0).sort((a,b) => b.recYds - a.recYds)[0];

          return { passer, rusher, receiver };
      };

      const homeStats = getTopStats('home');
      const awayStats = getTopStats('away');

      const renderStatLine = (p, type) => {
          if (!p) return '<span style="color: #666;">-</span>';
          if (type === 'pass') return `<strong>${p.name}</strong><br>${p.passComp}/${p.passAtt}, ${p.passYds} yds, ${p.passTD} TD`;
          if (type === 'rush') return `<strong>${p.name}</strong><br>${p.rushAtt} car, ${p.rushYds} yds, ${p.rushTD} TD`;
          if (type === 'rec') return `<strong>${p.name}</strong><br>${p.rec} rec, ${p.recYds} yds, ${p.recTD} TD`;
      };

      container.innerHTML = `
        <div class="game-stats-panel" style="margin-top: 0;">
            <div class="stats-column">
                <h4>${this.gameState.away.team.abbr} Leaders</h4>
                <div class="stat-leader">
                    <div class="type">Passing</div>
                    <div class="value">${renderStatLine(awayStats.passer, 'pass')}</div>
                </div>
                <div class="stat-leader">
                    <div class="type">Rushing</div>
                    <div class="value">${renderStatLine(awayStats.rusher, 'rush')}</div>
                </div>
                <div class="stat-leader">
                    <div class="type">Receiving</div>
                    <div class="value">${renderStatLine(awayStats.receiver, 'rec')}</div>
                </div>
            </div>
            <div class="stats-column">
                <h4>${this.gameState.home.team.abbr} Leaders</h4>
                <div class="stat-leader">
                    <div class="type">Passing</div>
                    <div class="value">${renderStatLine(homeStats.passer, 'pass')}</div>
                </div>
                <div class="stat-leader">
                    <div class="type">Rushing</div>
                    <div class="value">${renderStatLine(homeStats.rusher, 'rush')}</div>
                </div>
                <div class="stat-leader">
                    <div class="type">Receiving</div>
                    <div class="value">${renderStatLine(homeStats.receiver, 'rec')}</div>
                </div>
            </div>
        </div>
      `;
  }

  /**
   * Skip to next drive
   */
  skipToNextDrive() {
      if (this.intervalId) clearTimeout(this.intervalId);
      this.isPaused = false;
      this.isPlaying = true;
      this.isSkipping = true;

      const currentPossession = this.gameState.ballPossession;
      let safetyCounter = 0;

      // Simulate until possession changes
      while (this.gameState.ballPossession === currentPossession && !this.gameState.gameComplete && safetyCounter < 50) {
          safetyCounter++;
          const state = this.gameState;
          const offense = state.ballPossession === 'home' ? state.home : state.away;
          const defense = state.ballPossession === 'home' ? state.away : state.home;
          const isUserOffense = offense.team.id === this.userTeamId;

          const play = this.generatePlay(offense, defense, state, isUserOffense, null, null);

          this.playByPlay.push(play);
          this.renderPlay(play); // Safe guarded
          this.updateGameState(play, state);
          this.handleEndOfQuarter(state);
      }

      this.isSkipping = false;
      this.isPaused = true; // Pause after drive
      this.renderGame(); // Safe guarded
  }

  /**
   * Show modal
   */
  showModal() {
    if (this.modal) {
      this.modal.hidden = false;
      this.modal.style.display = 'flex';
    }
  }

  /**
   * Hide modal
   */
  hideModal() {
    if (this.modal) {
      this.modal.hidden = true;
      this.modal.style.display = 'none';
    }
    this.isPlaying = false;
    this.isPaused = true;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.isPlaying = false;
    this.isPaused = true;
    this.isGameEnded = true; // Prevent further updates

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.hideModal();

    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }

    if (this.container) {
        this.container.innerHTML = '';
        this.container = null;
    }

    this.gameState = null;
  }

  // --- PERSISTENCE ---
  saveTempState() {
      if (!this.gameState || this.isGameEnded) return;
      // Sanitize: remove circular team refs if any (usually not in sim)
      // Actually gameState has team objects which might be large but usually serializable
      const data = {
          gameState: this.gameState,
          playByPlay: this.playByPlay,
          userTeamId: this.userTeamId,
          preGameContext: this.preGameContext,
          simulationMeta: this.simulationMeta,
          timestamp: Date.now()
      };
      try {
          localStorage.setItem('live_game_temp', JSON.stringify(data));
      } catch (e) { console.warn('Temp save failed', e); }
  }

  clearTempState() {
      localStorage.removeItem('live_game_temp');
  }

  restoreTempState(homeId = null, awayId = null) {
      try {
          const raw = localStorage.getItem('live_game_temp');
          if (!raw) return false;
          const data = JSON.parse(raw);

          // Verify expiry (1 hour)
          if (Date.now() - data.timestamp > 3600000) {
              this.clearTempState();
              return false;
          }

          // Verify teams match if provided
          if (homeId !== null && awayId !== null) {
              const savedHome = data.gameState.home.team.id;
              const savedAway = data.gameState.away.team.id;

              if (savedHome != homeId || savedAway != awayId) {
                  return false;
              }
          }

          this.gameState = data.gameState;
          this.playByPlay = data.playByPlay;
          this.userTeamId = data.userTeamId;
          this.preGameContext = data.preGameContext;
          this.simulationMeta = data.simulationMeta;
          this.currentPlayIndex = this.playByPlay.length;

          console.log('Restored live game state from local storage');
          return true;
      } catch (e) {
          console.error('Failed to restore state', e);
          return false;
      }
  }
}

// Initialize global instance
if (!window.liveGameViewer) {
  window.liveGameViewer = new LiveGameViewer();
}

/**
 * Helper function to start watching a game (with live coaching for user's team)
 * @param {number} homeTeamId - Home team ID
 * @param {number} awayTeamId - Away team ID
 */

window.watchLiveGame = function(homeTeamId, awayTeamId) {
  try {
    const L = window.state?.league;
    if (!L || !L.teams) {
      console.error('No league loaded');
      window.setStatus('No league loaded. Please start a new game.', 'error');
      return;
    }

    // Ensure liveGameViewer is initialized
    if (!window.liveGameViewer) {
      window.liveGameViewer = new LiveGameViewer();
    }

    // Normalize team IDs - handle both object and number formats
    const homeId = typeof homeTeamId === 'object' ? homeTeamId.id : parseInt(homeTeamId, 10);
    const awayId = typeof awayTeamId === 'object' ? awayTeamId.id : parseInt(awayTeamId, 10);

    if (isNaN(homeId) || isNaN(awayId)) {
      console.error('Invalid team IDs:', homeTeamId, awayTeamId);
      window.setStatus('Invalid team IDs for live game.', 'error');
      return;
    }

    const homeTeam = L.teams[homeId];
    const awayTeam = L.teams[awayId];
    const userTeamId = window.state?.userTeamId;

    // CHECK IF GAME IS FINALIZED
    if (L.schedule) {
        const weekIndex = (L.week || 1) - 1;
        const scheduleWeeks = L.schedule.weeks || L.schedule;
        if (scheduleWeeks && scheduleWeeks[weekIndex]) {
            const schedGame = scheduleWeeks[weekIndex].games.find(g => (g.home === homeId || g.home.id === homeId) && (g.away === awayId || g.away.id === awayId));
            if (schedGame && schedGame.finalized) {
                console.log("Game already finalized, showing box score instead.");
                if (window.showBoxScore) {
                    const gameIdx = scheduleWeeks[weekIndex].games.indexOf(schedGame);
                    window.showBoxScore(L.week, gameIdx);
                } else {
                    window.setStatus('This game has already been played.', 'warning');
                }
                return;
            }
        }
    }

    if (!homeTeam || !awayTeam) {
      console.error('Teams not found for IDs:', homeId, awayId);
      window.setStatus('Could not find teams for live game.', 'error');
      return;
    }

    // Check if this is a user's team game for play calling
    const isUserGame = homeId === userTeamId || awayId === userTeamId;
    
    window.setStatus(`Starting live game: ${awayTeam.name} @ ${homeTeam.name}${isUserGame ? ' (You can call plays!)' : ''}`, 'success');

    // 1. Initialize Game State FIRST (paused) to pass router checks
    window.liveGameViewer.initGame(homeTeam, awayTeam, userTeamId);

    // 2. Switch View (triggers router)
    if (location.hash !== '#/game-sim') {
        location.hash = '#/game-sim';
    }

    // 3. Wait a tick for router to render view, then start sim
    setTimeout(() => {
        // Double check render if router missed it
        window.liveGameViewer.renderToView('#game-sim');
        window.liveGameViewer.startSim();
    }, 50);

  } catch (error) {
    console.error('Error starting live game:', error);
    if (window.setStatus) {
      window.setStatus(`Error starting live game: ${error.message}`, 'error');
    }
  }
};

console.log('✅ Live Game Viewer loaded');
