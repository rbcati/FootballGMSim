import { commitGameResult } from './game-simulator.js';
import soundManager from './sound-manager.js';
import { launchConfetti } from './confetti.js';
import { FieldEffects } from './field-effects.js';

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
    this.driveMomentum = 0; // Heat of current drive
    this.lastFireTime = 0; // Throttle for momentum fire effects

    this.timeouts = new Set(); // Track active timeouts
  }

  /**
   * Safe timeout wrapper to prevent memory leaks and zombie callbacks
   */
  setTimeoutSafe(callback, delay) {
      if (this.isGameEnded) return null;
      const id = setTimeout(() => {
          this.timeouts.delete(id);
          // Double check state before execution
          if (!this.isGameEnded && this.checkUI()) {
              callback();
          }
      }, delay);
      this.timeouts.add(id);
      return id;
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

    // Clear all tracked timeouts
    if (this.timeouts) {
        this.timeouts.forEach(id => clearTimeout(id));
        this.timeouts.clear();
    }

    // Cleanup effects
    if (this.fieldEffects) {
        this.fieldEffects.destroy();
        this.fieldEffects = null;
    }

    this.gameState = null;
    this.isGameEnded = true; // Prevent any pending callbacks
    this.clearTempState();
  }

  /**
   * Helper to check if UI is available
   */
  checkUI(force = false) {
    if (this.viewMode) {
      // Ensure container is in DOM AND visible (not hidden by router)
      // Force skips visibility check (offsetParent) for initial render
      const exists = this.container && document.body.contains(this.container);
      return force ? exists : (exists && this.container.offsetParent !== null);
    }
    // Modal check
    return this.modal && document.body.contains(this.modal) && !this.modal.hidden && this.modal.style.display !== 'none';
  }

  triggerShake(intensity = 'normal') {
      const target = this.viewMode ? this.container : this.modal;
      if (target) {
          target.classList.remove('shake', 'shake-hard');
          void target.offsetWidth; // Force reflow
          target.classList.add(intensity === 'hard' ? 'shake-hard' : 'shake');
          this.setTimeoutSafe(() => target.classList.remove('shake', 'shake-hard'), 500);
      }
  }

  triggerFlash() {
      const flash = document.createElement('div');
      flash.className = 'flash-overlay';
      document.body.appendChild(flash);
      this.setTimeoutSafe(() => flash.remove(), 600);
  }

  triggerImpact() {
      const target = this.viewMode ? this.container : this.modal;
      if (target) {
          target.classList.remove('impact-pulse');
          void target.offsetWidth; // Force reflow
          target.classList.add('impact-pulse');
          this.setTimeoutSafe(() => target.classList.remove('impact-pulse'), 300);
      }
  }

  triggerFloatText(text, type = '') {
      const el = document.createElement('div');
      el.className = `float-text ${type}`;
      el.textContent = text;
      el.style.left = '50%';
      el.style.top = '40%';
      el.style.marginLeft = `-${text.length * 10}px`; // Rough centering
      document.body.appendChild(el);
      this.setTimeoutSafe(() => el.remove(), 1500);
  }

  /**
   * Helper to resolve CSS variables to hex/rgb
   */
  getColor(varName, fallback) {
      if (typeof window === 'undefined') return fallback || '#fff';
      if (!varName) return fallback || '#fff';
      if (!varName.startsWith('--') && !varName.startsWith('var(')) return varName;

      try {
          let name = varName;
          if (varName.startsWith('var(')) {
              const match = varName.match(/var\(([^,)]+)/);
              if (match) name = match[1];
          }
          const val = getComputedStyle(document.body).getPropertyValue(name).trim();
          return val || fallback || '#fff';
      } catch (e) {
          return fallback || '#fff';
      }
  }

  /**
   * Show quarter end overlay
   */
  showQuarterOverlay(quarter) {
      if (!this.checkUI()) return;
      const text = `END OF Q${quarter}`;
      this.triggerVisualFeedback('quarter-end', text);

      // Also show a banner if possible
      const parent = this.viewMode ? this.container : this.modal.querySelector('.modal-content');
      const banner = document.createElement('div');
      banner.style.position = 'absolute';
      banner.style.top = '50%';
      banner.style.left = '0';
      banner.style.width = '100%';
      banner.style.transform = 'translateY(-50%)';
      banner.style.background = 'rgba(0,0,0,0.85)';
      banner.style.color = '#fff';
      banner.style.padding = '20px';
      banner.style.textAlign = 'center';
      banner.style.fontSize = '3rem';
      banner.style.fontWeight = '900';
      banner.style.zIndex = '2000';
      banner.style.textShadow = '0 0 20px var(--accent)';
      banner.style.borderTop = '2px solid var(--accent)';
      banner.style.borderBottom = '2px solid var(--accent)';
      banner.textContent = text;
      banner.classList.add('pop-in');

      if (getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
      }
      parent.appendChild(banner);

      this.setTimeoutSafe(() => {
          banner.classList.add('fade-out');
          this.setTimeoutSafe(() => banner.remove(), 500);
      }, 2000);
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
    let diffColor = 'var(--text-muted)';
    if (this.preGameContext?.difficulty) {
        if (this.preGameContext.difficulty.includes('Easy')) diffColor = 'var(--success)';
        else if (this.preGameContext.difficulty.includes('Hard') || this.preGameContext.difficulty.includes('Nightmare')) diffColor = 'var(--danger)';
        else diffColor = 'var(--accent)';
    }

    let difficultyText = this.preGameContext?.difficulty || '';
    let adaptiveBadge = '';

    if (this.preGameContext?.adaptiveAI) {
        adaptiveBadge = `<span class="adaptive-badge">🤖 ADAPTIVE</span>`;
    }

    const difficultyHtml = difficultyText ?
        `<div class="difficulty-badge" style="color: ${diffColor}; text-shadow: 0 0 10px ${diffColor}40;">${difficultyText} ${adaptiveBadge}</div>` : '';

    let stakesHtml = '';
    if (this.preGameContext?.stakes > 60) {
         const isExtreme = this.preGameContext.stakes > 80;
         const color = isExtreme ? '#ef4444' : '#fbbf24';
         let text = this.preGameContext.reason || (isExtreme ? '🔥 HIGH STAKES 🔥' : '⚠️ KEY MATCHUP');

         // Add icons based on text content if generic
         if (text === 'RIVALRY MATCHUP') text = '⚔️ RIVALRY MATCHUP ⚔️';
         else if (text === 'PLAYOFF ELIMINATION') text = '🏆 PLAYOFF GAME 🏆';
         else if (text === 'CRITICAL SEEDING GAME') text = '📅 CRITICAL MATCHUP';

         const animation = isExtreme ? 'pulse-text-glow 1.5s infinite alternate' : '';

         stakesHtml = `
            <div class="stakes-badge" style="font-size: ${isExtreme ? '1.1em' : '0.9em'}; font-weight: 800; color: ${color}; text-shadow: 0 0 15px ${color}60; animation: ${animation};">
                ${text}
            </div>
         `;

         // Audio Cue for Stakes
         this.setTimeoutSafe(() => {
             if (isExtreme) {
                 if (soundManager.playHeartbeat) soundManager.playHeartbeat();
             } else {
                 if (soundManager.playMomentumShift) soundManager.playMomentumShift();
             }
         }, 500);
    }

    container.innerHTML = `
      <div class="fade-in-view">
      <div class="card live-game-header">
        ${stakesHtml}
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
            <div class="momentum-panel"></div>
                </div>
                <div class="stats-panel"></div>
            </div>
            <div class="card play-calling" style="display: none;">
                <!-- Play calling UI injected here -->
            </div>
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

    this.renderGame(true);
  }

  /**
   * Render the visual field
   */
  renderField(container) {
      if (!container) return;

      // Initialize Field Effects overlay
      if (this.fieldEffects && this.fieldEffects.container !== container) {
          this.fieldEffects.destroy();
          this.fieldEffects = null;
      }

      if (!this.fieldEffects) {
          this.fieldEffects = new FieldEffects(container);
      } else {
          this.fieldEffects.resize();
      }

      // Apply Weather
      if (this.fieldEffects && this.preGameContext && this.preGameContext.weather) {
          this.fieldEffects.startWeather(this.preGameContext.weather);
      }

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

           <!-- Hash Marks (Every 5 yards) -->
           ${Array.from({length: 19}, (_, i) => (i + 1) * 5).filter(y => y % 10 !== 0).map(y =>
               `<div class="field-hash" style="left: ${(10 + y) / 1.2}%"></div>`
           ).join('')}

           <div class="marker-los" style="left: 50%;"></div>
           <div class="marker-first-down" style="left: 58.33%;"></div>

           <div class="player-markers">
               <div class="player-marker marker-qb"></div>
               <div class="player-marker marker-skill"></div>
               <div class="player-marker marker-def"></div>
           </div>

           <div class="football-ball" style="left: 50%;"></div>

           <div class="endzone right" style="background-color: ${awayColor}; opacity: 0.8;">${awayName}</div>
        </div>
      `;
  }

  /**
   * Update field markers with smooth transitions or fading
   */
  updateFieldState(yardLine, isHomePossession) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;
      if (!parent) return;

      const ballEl = parent.querySelector('.football-ball') || parent.querySelector('.ball');
      const losEl = parent.querySelector('.marker-los') || parent.querySelector('.field-marker.marker-los');
      const fdEl = parent.querySelector('.marker-first-down') || parent.querySelector('.field-marker.marker-first-down');

      if (!ballEl) return;

      let visualYard = isHomePossession ? yardLine : (100 - yardLine);
      let pct = (10 + visualYard) / 1.2;

      const currentLeft = parseFloat(ballEl.style.left || '-1');

      // Detect Jump (> 20% difference implies large teleportation/turnover)
      const dist = Math.abs(pct - currentLeft);
      const isTeleport = currentLeft > 0 && dist > 20;

      if (isTeleport) {
          // Add blur effect to container for smoother transition feeling
          const fieldContainer = parent.querySelector('.football-field-container') || parent.querySelector('.field-container');
          if (fieldContainer) fieldContainer.classList.add('blur-transition');

          // Fade Out Sequence
          const elements = [ballEl, losEl, fdEl].filter(e => e);
          elements.forEach(e => {
              if (!e.classList.contains('fade-out')) e.classList.add('fade-out');
          });

          this.triggerShake();

          this.setTimeoutSafe(() => {
              elements.forEach(e => {
                  e.style.transition = 'none';
                  e.style.left = `${pct}%`;
                  e.style.transform = 'translate(-50%, -50%)'; // Reset any transforms
              });

              // First Down update inside timeout
              const state = this.gameState;
              if (state && fdEl) {
                  const d = state[isHomePossession ? 'home' : 'away'].distance;
                  let targetYard = yardLine + d;
                  if (targetYard > 100) targetYard = 100;
                  let visualTarget = isHomePossession ? targetYard : (100 - targetYard);
                  let fdPct = (10 + visualTarget) / 1.2;
                  fdEl.style.left = `${fdPct}%`;
                  fdEl.style.display = (yardLine + d >= 100) ? 'none' : 'block';
              }

              void ballEl.offsetWidth; // Reflow

              if (fieldContainer) fieldContainer.classList.remove('blur-transition');

              elements.forEach(e => {
                  e.style.transition = '';
                  e.classList.remove('fade-out');
                  e.classList.add('fade-in');
              });

              this.setTimeoutSafe(() => {
                  elements.forEach(e => e.classList.remove('fade-in'));
              }, 300);
          }, 300);
      } else {
          // Normal Smooth Update (CSS transition handles it)
          // Ensure transition is active if it was disabled by JS animation previously and not cleared
          if (ballEl.style.transition === 'none') {
              ballEl.style.transition = ''; // Revert to CSS class transition
              ballEl.classList.add('smooth-transition');
          }

          ballEl.style.left = `${pct}%`;
          if (losEl) losEl.style.left = `${pct}%`;

          // FD Logic
          const state = this.gameState;
          if (state && fdEl) {
              const d = state[isHomePossession ? 'home' : 'away'].distance;
              let targetYard = yardLine + d;
              if (targetYard > 100) targetYard = 100;
              let visualTarget = isHomePossession ? targetYard : (100 - targetYard);
              let fdPct = (10 + visualTarget) / 1.2;
              fdEl.style.left = `${fdPct}%`;
              fdEl.style.display = (yardLine + d >= 100) ? 'none' : 'block';
          }
      }

      // Hide players regardless (reset state)
      const qbMarker = parent.querySelector('.marker-qb');
      const skillMarker = parent.querySelector('.marker-skill');
      if (qbMarker) qbMarker.style.opacity = 0;
      if (skillMarker) skillMarker.style.opacity = 0;
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

          // Shadow selection
          const shadowEl = (element.classList.contains('ball') || element.classList.contains('football-ball'))
              ? element.parentElement.querySelector('.ball-shadow')
              : null;

          if (this.isSkipping) {
               element.style.left = `${options.endX}%`;
               if (options.arcHeight) element.style.transform = `translate(-50%, -50%)`;
               if (shadowEl) {
                   shadowEl.style.left = `${options.endX}%`;
                   shadowEl.style.transform = `translate(-50%, -50%)`;
                   shadowEl.style.opacity = 1;
               }
               return resolve();
          }

          const startX = options.startX;
          const endX = options.endX;
          const duration = options.duration || 1000;
          const arcHeight = options.arcHeight || 0;
          const shouldRotate = options.rotate || false;

          const startTime = performance.now();

          // Apply animation class
          if (options.animationClass) element.classList.add(options.animationClass);

          // CRITICAL: Disable CSS transitions while JS is driving the position
          // This prevents the browser from interpolating between JS frames, which causes lag/drag.
          element.style.transition = 'none';

          // Easing functions
          const easeLinear = t => t;
          const easeOutQuad = t => t * (2 - t);
          const easeInOutQuad = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
          const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
          const easeOutBack = t => {
              const c1 = 1.70158;
              const c3 = c1 + 1;
              return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
          };
          const easeInBack = t => {
              const c1 = 1.70158;
              const c3 = c1 + 1;
              return c3 * t * t * t - c1 * t * t;
          };
          const easeOutElastic = t => {
              const c4 = (2 * Math.PI) / 3;
              return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
          };
          const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

          // Bounce easing for landings
          const easeBounce = t => {
              const n1 = 7.5625;
              const d1 = 2.75;
              if (t < 1 / d1) {
                  return n1 * t * t;
              } else if (t < 2 / d1) {
                  return n1 * (t -= 1.5 / d1) * t + 0.75;
              } else if (t < 2.5 / d1) {
                  return n1 * (t -= 2.25 / d1) * t + 0.9375;
              } else {
                  return n1 * (t -= 2.625 / d1) * t + 0.984375;
              }
          };

          let easing = easeInOutQuad;
          if (options.easing === 'linear') easing = easeLinear;
          else if (options.easing === 'easeOut') easing = easeOutQuad;
          else if (options.easing === 'easeOutCubic') easing = easeOutCubic;
          else if (options.easing === 'easeOutQuart') easing = easeOutQuart;
          else if (options.easing === 'easeOutBack') easing = easeOutBack;
          else if (options.easing === 'easeInBack') easing = easeInBack;
          else if (options.easing === 'easeOutElastic') easing = easeOutElastic;
          else if (options.easing === 'easeInOutCubic') easing = easeInOutCubic;
          else if (options.easing === 'bounce') easing = easeBounce;

          // Pre-calculate field width for transform logic
          const fieldWidth = element.offsetParent ? element.offsetParent.offsetWidth : 0;
          // Set initial left position just once
          element.style.left = `${startX}%`;
          if (shadowEl) shadowEl.style.left = `${startX}%`;

          const animate = (currentTime) => {
              // Safety break for cleanup
              if (this.isGameEnded || !this.checkUI() || (this.viewMode && !this.container)) {
                  if (options.animationClass) element.classList.remove(options.animationClass);
                  return resolve();
              }

              // RACE CONDITION FIX: Check skipping flag INSIDE loop
              if (this.isSkipping) {
                   // Ensure final state is applied instantly
                   element.style.left = `${endX}%`;
                   element.style.transform = 'translate(-50%, -50%)'; // Reset transform
                   if (arcHeight) element.style.transform = `translate(-50%, -50%)`;
                   if (shadowEl) {
                       shadowEl.style.left = `${endX}%`;
                       shadowEl.style.transform = `translate(-50%, -50%)`;
                       shadowEl.style.opacity = 1;
                   }
                   if (options.animationClass) element.classList.remove(options.animationClass);
                   element.style.transition = ''; // Restore transitions
                   return resolve();
              }

              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeProgress = easing(progress);

              // Calculate X displacement in pixels for transform
              // This prevents layout thrashing by avoiding left property updates
              const deltaXPercent = (endX - startX) * easeProgress;
              const currentXPercent = startX + deltaXPercent;
              const translateX = (deltaXPercent / 100) * fieldWidth;

              // Trail Effect (use calculated current percentage)
              if (options.trail && this.fieldEffects && Math.random() > 0.6) {
                  this.fieldEffects.spawnParticles(currentXPercent, 'trail');
              }

              let translateY = 0;
              let rotation = '';
              let scale = '';

              // Y Position (Arc)
              if (arcHeight) {
                  // Parabola: y = 4 * h * x * (1 - x)
                  const parabolicY = -4 * arcHeight * easeProgress * (1 - easeProgress);
                  translateY = parabolicY;
              }

              // Sway Logic (Lateral Movement for Runs)
              if (options.sway) {
                  // Sine wave lateral movement
                  const swayAmount = typeof options.sway === 'number' ? options.sway : 5;
                  const lateralOffset = Math.sin(easeProgress * Math.PI * 4) * swayAmount;
                  translateY += lateralOffset;
              }

              // Rotation logic
              if (shouldRotate) {
                  if (options.rotateType === 'spiral') {
                      // Fast spiral rotation
                      const rotations = 4;
                      const rot = easeProgress * (360 * rotations);
                      rotation = `rotate(${rot}deg)`;
                      // Slight wobble scale
                      const wobble = 1 - (Math.sin(easeProgress * Math.PI * 8) * 0.1);
                      scale = `scale(${wobble})`;
                  } else if (options.rotateType === 'wobble') {
                      // Gentle wobble
                      const angle = Math.sin(easeProgress * Math.PI * 6) * 15;
                      rotation = `rotate(${angle}deg)`;
                  } else {
                      // Standard tumble
                      const rotations = 2;
                      const rot = easeProgress * (360 * rotations);
                      rotation = `rotate(${rot}deg)`;
                  }
              }

              // Apply Transform (Combined X and Y)
              // We use calc(-50% + Xpx) to maintain the centering of the marker while moving it
              element.style.transform = `translate3d(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px), 0) ${rotation} ${scale}`;

              // Shadow Effect (only if arc)
              if (shadowEl) {
                   const shadowTranslateX = translateX;
                   let shadowScale = 1;
                   let shadowOpacity = 1;
                   let shadowBlur = 1;

                   if (arcHeight) {
                       const peakFactor = 4 * easeProgress * (1 - easeProgress);
                       shadowScale = 1 - (peakFactor * 0.5); // Shrink more
                       shadowOpacity = 1 - (peakFactor * 0.6); // Fade more
                       shadowBlur = peakFactor * 2;
                   }

                   shadowEl.style.transform = `translate3d(calc(-50% + ${shadowTranslateX}px), -50%, 0) scale(${shadowScale})`;
                   shadowEl.style.opacity = Math.max(0.2, shadowOpacity);
                   shadowEl.style.filter = `blur(${shadowBlur}px)`;
              }

              if (progress < 1) {
                  requestAnimationFrame(animate);
              } else {
                  // Finalize state - Commit the final 'left' position and reset transform
                  // This ensures responsive resizing works after animation ends
                  element.style.left = `${endX}%`;
                  element.style.transform = `translate(-50%, -50%)`; // Back to standard centering

                  if (shadowEl) {
                      shadowEl.style.left = `${endX}%`;
                      shadowEl.style.transform = `translate(-50%, -50%) scale(1)`;
                      shadowEl.style.opacity = 1;
                      shadowEl.style.filter = 'blur(1px)';
                  }
                  if (options.animationClass) element.classList.remove(options.animationClass);

                  // Restore CSS transitions (clear inline style to revert to CSS class)
                  element.style.transition = '';

                  resolve();
              }
          };

          this.animationFrameId = requestAnimationFrame(animate);
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
      if (!parent) return Promise.resolve();

      // Safety check for FieldEffects
      if (!this.fieldEffects) {
          // Try to recover or just proceed without effects
          if (parent && parent.querySelector('.field-wrapper')) {
              this.renderField(parent.querySelector('.field-wrapper'));
          }
          if (!this.fieldEffects) return Promise.resolve();
      }

      const ballEl = parent.querySelector('.football-ball') || parent.querySelector('.ball');
      const ballShadow = parent.querySelector('.ball-shadow');
      const qbMarker = parent.querySelector('.marker-qb');
      const skillMarker = parent.querySelector('.marker-skill');
      const defMarker = parent.querySelector('.marker-def');

      if (!ballEl) return Promise.resolve();

      // Duration Scaling
      let durationScale = 1;
      if (this.tempo === 'hurry-up') durationScale = 0.5;
      if (this.tempo === 'slow') durationScale = 2.0;

      // Slow-Mo for Big Plays
      if (play.result === 'big_play') {
          durationScale *= 1.5;
          const root = this.viewMode ? this.container : this.modal;
          const fieldWrapper = root ? root.querySelector('.field-wrapper') : null;
          if (fieldWrapper) {
              fieldWrapper.style.transition = 'transform 1s ease';
              fieldWrapper.style.transform = 'scale(1.05)';
              this.setTimeoutSafe(() => fieldWrapper.style.transform = 'scale(1)', 2000 * durationScale);
          }
      }

      // Critical Moment Heartbeat
      const scoreDiff = Math.abs(this.gameState.home.score - this.gameState.away.score);
      const isCritical = this.gameState.quarter >= 4 && scoreDiff <= 8 && play.down >= 3;

      if (isCritical && !play.playType.includes('kick') && !play.playType.includes('punt')) {
          soundManager.playHeartbeat();
          if (play.down === 4) this.triggerFloatText('CRITICAL DOWN', 'warning');
      }

      // Use startState.possession to determine perspective during the play (before any switch)
      const playPossession = startState ? startState.possession : this.gameState.ballPossession;
      const isHome = playPossession === 'home';

      const startYard = startState ? startState.yardLine : play.yardLine;
      const endYard = startYard + play.yards; // Simplified end point

      // Visual Points
      const startPct = this.getVisualPercentage(startYard, isHome);
      let endPct = this.getVisualPercentage(Math.max(-5, Math.min(105, endYard)), isHome);

      // Check for seamless transition (prevent snap)
      const currentLeft = parseFloat(ballEl.style.left || '-1');
      const shouldSnap = Math.abs(currentLeft - startPct) > 1;

      // Reset Ball with Smooth Fade for Possession Change
      if (shouldSnap) {
          // Fade Out
          ballEl.style.opacity = 0;
          if (ballShadow) ballShadow.style.opacity = 0;

          await new Promise(r => this.setTimeoutSafe(r, 200));

          ballEl.style.transition = 'none';
          ballEl.style.left = `${startPct}%`;
          ballEl.style.transform = 'translate(-50%, -50%)';

          if (ballShadow) {
              ballShadow.style.transition = 'none';
              ballShadow.style.left = `${startPct}%`;
              ballShadow.style.transform = 'translate(-50%, -50%)';
          }

          // Wait briefly for position to set
          await new Promise(r => this.setTimeoutSafe(r, 50));

          // Fade In
          ballEl.style.opacity = 1;
          if (ballShadow) ballShadow.style.opacity = 1;
          ballEl.style.transition = '';
      }

      // Setup Markers
      const setupMarker = (el, color, show = true) => {
          if (el) {
              el.style.transition = 'none';
              el.style.left = `${startPct}%`;
              el.style.opacity = show ? '1' : '0';
              el.style.backgroundColor = color;
              el.classList.remove('pulse-marker', 'celebrate-jump', 'celebrate-spin', 'marker-catch', 'marker-collision', 'dive-td');
          }
      };

      const homeColor = 'var(--accent, #007bff)';
      const awayColor = 'var(--danger, #dc3545)';
      const offenseColor = isHome ? homeColor : awayColor;
      const defenseColor = isHome ? awayColor : homeColor;

      setupMarker(qbMarker, offenseColor, true);
      if (qbMarker) qbMarker.classList.add('pulse-marker');
      setupMarker(skillMarker, offenseColor, false);

      // Initialize Defense
      if (defMarker) {
          setupMarker(defMarker, defenseColor, true);
          // Defense starts slightly off LOS
          const defStartPct = this.getVisualPercentage(startYard + (isHome ? 5 : -5), isHome);
          defMarker.style.left = `${defStartPct}%`;
      }

      void ballEl.offsetWidth; // Reflow

      // PRE-SNAP PHASE
      if (!play.playType.includes('kick') && !play.playType.includes('punt')) {
          // Randomized cadence delay (variable start count)
          const cadenceDelay = (300 + Math.random() * 400) * durationScale;
          await new Promise(r => this.setTimeoutSafe(r, cadenceDelay));

          if (qbMarker) qbMarker.classList.add('pre-snap-set');

          // RB Offset Logic: If run play, position RB slightly back for handoff visual
          if (play.playType.startsWith('run') && skillMarker) {
               const rbOffset = isHome ? -3 : 3; // 3 yards back
               const rbStartPct = this.getVisualPercentage(startYard + rbOffset, isHome);
               skillMarker.style.left = `${rbStartPct}%`;
               skillMarker.classList.add('pre-snap-set');
          } else if (skillMarker && skillMarker.style.opacity !== '0') {
               skillMarker.classList.add('pre-snap-set');
          }

          if (defMarker) defMarker.classList.add('pre-snap-set');

          // Ball bob slightly (center)
          if (ballEl) {
              ballEl.style.transform = 'translate(-50%, -55%)';
              this.setTimeoutSafe(() => ballEl.style.transform = 'translate(-50%, -50%)', 200);
          }

          await new Promise(r => this.setTimeoutSafe(r, 400 * durationScale));

          if (qbMarker) qbMarker.classList.remove('pre-snap-set');
          if (skillMarker) skillMarker.classList.remove('pre-snap-set');
          if (defMarker) defMarker.classList.remove('pre-snap-set');
      }

      // --- PLAY TYPES ---

      if (play.playType.startsWith('pass')) {
          // PASS PLAY: Dropback -> Pass -> Catch/Run

          // 1. Dropback
          const dropbackPct = this.getVisualPercentage(Math.max(0, startYard - 5), isHome);
          const dropbackDuration = 600 * durationScale;

          if (skillMarker) skillMarker.style.opacity = '1';
          if (qbMarker) qbMarker.classList.remove('pulse-marker');

          const animations = [];

          // QB Drops back
          animations.push(this.animateTrajectory(qbMarker, {
              startX: startPct, endX: dropbackPct, duration: dropbackDuration, easing: 'easeOut', animationClass: 'bob'
          }));

          // Receiver runs route
          animations.push(this.animateTrajectory(skillMarker, {
              startX: startPct, endX: endPct, duration: dropbackDuration + 400 * durationScale, easing: 'easeInOut', animationClass: 'bob'
          }));

          // Ball snaps to QB
          if (shouldSnap) {
             animations.push(this.animateTrajectory(ballEl, {
                 startX: startPct, endX: dropbackPct, duration: dropbackDuration, easing: 'easeOut'
             }));
          } else {
             // If fluid, maybe just animate from current?
             animations.push(this.animateTrajectory(ballEl, {
                 startX: startPct, endX: dropbackPct, duration: dropbackDuration, easing: 'easeOut'
             }));
          }

          // Def Logic
          if (defMarker) {
             if (play.result === 'sack') {
                 // Rush QB
                 animations.push(this.animateTrajectory(defMarker, {
                     startX: parseFloat(defMarker.style.left), endX: dropbackPct, duration: dropbackDuration, easing: 'easeIn'
                 }));
             } else {
                 // Cover Receiver
                 animations.push(this.animateTrajectory(defMarker, {
                     startX: parseFloat(defMarker.style.left), endX: endPct, duration: dropbackDuration + 400 * durationScale, easing: 'easeInOut'
                 }));
             }
          }

          await Promise.all(animations);

          // SACK CHECK
          if (play.result === 'sack') {
             if (qbMarker) {
                 qbMarker.classList.add('sack-shake');
                 this.setTimeoutSafe(() => qbMarker.classList.remove('sack-shake'), 600);
             }
             if (defMarker) defMarker.classList.add('tackle-collision');
          } else {
              // 2. Throw
              const throwDuration = 700 * durationScale;

              // QB Windup Animation
              if (qbMarker) {
                  qbMarker.classList.add('throw-animation');
                  // Add delay for windup before ball release
                  await new Promise(r => this.setTimeoutSafe(r, 200 * durationScale));
                  this.setTimeoutSafe(() => qbMarker.classList.remove('throw-animation'), 500);
              }

              if (play.playType === 'pass_long' && this.fieldEffects) {
                  this.fieldEffects.spawnParticles(dropbackPct, 'spiral');
              }

              // Determine rotation type
              const rotType = play.playType === 'pass_short' ? 'wobble' : 'spiral';

              // Ball Arc - Use Linear for X to simulate projectile
              await this.animateTrajectory(ballEl, {
                  startX: dropbackPct,
                  endX: endPct,
                  duration: throwDuration,
                  arcHeight: 25,
                  easing: 'linear', // Improved physics
                  rotate: true,
                  rotateType: rotType,
                  trail: true
              });

              // Pulse if TD
              if (play.result === 'touchdown') {
                  ballEl.classList.add('animate-pulse');
                  if (skillMarker) skillMarker.classList.add('celebrate-jump');
              }

              // Catch Effect
              if (play.result !== 'incomplete' && play.result !== 'interception' && play.result !== 'turnover') {
                   if (this.fieldEffects) this.fieldEffects.spawnParticles(endPct, 'catch');
                   soundManager.playCatch();
                   if (skillMarker) {
                       skillMarker.classList.add('marker-catch');
                       this.setTimeoutSafe(() => skillMarker.classList.remove('marker-catch'), 500);
                   }
              }

              // End of play collision (tackle)
              if (play.result !== 'touchdown' && play.result !== 'incomplete' && play.result !== 'interception') {
                  soundManager.playTackle();
                  this.triggerImpact(); // Visual impact
                  if (skillMarker) skillMarker.classList.add('tackle-collision');
                  if (defMarker) defMarker.classList.add('tackle-collision');
                  if (ballEl) {
                      ballEl.classList.add('tackle-collision');
                      this.setTimeoutSafe(() => ballEl.classList.remove('tackle-collision'), 300);
                  }
              }
          }

      } else if (play.playType.startsWith('run')) {
          // RUN PLAY - Handoff Sequence
          const handoffDuration = 500 * durationScale;

          if (skillMarker) {
              skillMarker.style.opacity = '1';
              // Note: skillMarker was positioned at rbStartPct in pre-snap phase
          }

          // Animate QB and RB meeting at mesh point (startPct)
          // 1. Mesh
          const meshAnimations = [];

          // QB moves to handoff point (if dropping back or just turning)
          if (qbMarker) {
              meshAnimations.push(this.animateTrajectory(qbMarker, {
                  startX: startPct, endX: startPct, duration: handoffDuration, easing: 'easeOut', animationClass: 'handoff-meet'
              }));
          }

          // RB moves forward to mesh point
          if (skillMarker) {
               // Calculate current pos (from pre-snap offset)
               // This is tricky because we set style.left directly.
               // We need to animate from that position.
               // animateTrajectory handles 'startX' as visual percentage.
               // We can get current percentage from style.left
               const rbCurrentPct = parseFloat(skillMarker.style.left);
               meshAnimations.push(this.animateTrajectory(skillMarker, {
                   startX: rbCurrentPct, endX: startPct, duration: handoffDuration, easing: 'easeIn', animationClass: 'handoff-meet'
               }));
          }

          // Ball stays with QB/Mesh
          if (ballEl) ballEl.classList.add('run-bob');

          await Promise.all(meshAnimations);

          // Handoff complete
          if (ballEl) ballEl.classList.remove('run-bob');

          const runDuration = 800 * durationScale;
          if (qbMarker) qbMarker.style.opacity = '0.5';

          const animations = [];

          // Use .run-bob instead of .bob for more energy
          // Use easeInOutCubic for smoother run
          const swayVal = play.playType === 'run_outside' ? 8 : 3;

          animations.push(this.animateTrajectory(ballEl, {
              startX: startPct, endX: endPct, duration: runDuration, easing: 'easeInOutCubic', animationClass: 'run-bob', sway: swayVal
          }));

          animations.push(this.animateTrajectory(skillMarker, {
              startX: startPct, endX: endPct, duration: runDuration, easing: 'easeInOutCubic', animationClass: 'run-bob', sway: swayVal
          }));

          // Def Logic: Chase
          if (defMarker) {
             animations.push(this.animateTrajectory(defMarker, {
                 startX: parseFloat(defMarker.style.left), endX: endPct, duration: runDuration, easing: 'easeInOut', animationClass: 'run-bob', sway: swayVal // Meet at tackle point
             }));
          }

          await Promise.all(animations);

          if (play.result === 'touchdown') {
              ballEl.classList.add('animate-pulse');
              // Dive Animation for Short TDs
              if (skillMarker && play.yards < 5) {
                  skillMarker.classList.add('dive-td');
              }
          } else if (skillMarker) {
              // Collision/Tackle
               ballEl.classList.add('animate-pulse');
               if (play.result === 'big_play') {
                   if (skillMarker) skillMarker.classList.add('celebrate-spin');
               } else {
                   // Standard tackle
                   soundManager.playTackle();
                   this.triggerImpact(); // Visual impact
                   if (skillMarker) {
                       skillMarker.classList.add('tackle-collision');
                       this.setTimeoutSafe(() => skillMarker.classList.remove('tackle-collision'), 300);
                   }
                   if (defMarker) {
                       defMarker.classList.add('tackle-collision');
                       this.setTimeoutSafe(() => defMarker.classList.remove('tackle-collision'), 300);
                   }
                   if (ballEl) {
                       ballEl.classList.add('tackle-collision');
                       this.setTimeoutSafe(() => ballEl.classList.remove('tackle-collision'), 300);
                   }
               }
          }

      } else if (play.playType === 'punt' || play.playType === 'field_goal') {
          // KICK
          const kickDuration = 1200 * durationScale;
          const arc = play.playType === 'punt' ? 40 : 30;

          if (ballEl) {
              ballEl.classList.add('kick-flash');
              this.setTimeoutSafe(() => ballEl.classList.remove('kick-flash'), 300);
          }

          if (qbMarker) qbMarker.style.opacity = 0;
          // Show skill marker as Kicker
          if (skillMarker) {
              skillMarker.style.opacity = 1;
              skillMarker.style.left = `${startPct}%`;
              skillMarker.classList.add('kick-follow-through');
              this.setTimeoutSafe(() => skillMarker.classList.remove('kick-follow-through'), 600);
          }
          if (defMarker) defMarker.style.opacity = 0; // Hide defense for kicks for simplicity

          if (this.fieldEffects) {
              this.fieldEffects.spawnParticles(startPct, 'kick');
          }
          soundManager.playKick();

          await this.animateTrajectory(ballEl, {
              startX: startPct,
              endX: endPct,
              duration: kickDuration,
              arcHeight: arc,
              easing: 'linear', // Projectile motion
              rotate: true,
              trail: true
          });

           if (play.result === 'touchdown' || play.result === 'field_goal') {
               ballEl.classList.add('animate-pulse');
               if (play.result === 'field_goal' && this.fieldEffects) {
                   this.fieldEffects.spawnParticles(endPct, 'field_goal'); // Use new gold sparkles
                   this.fieldEffects.spawnParticles(endPct, 'field_goal');
               }
               if (play.result === 'touchdown') {
                   // Celebration
                   if (skillMarker) {
                       const anims = ['celebrate-jump', 'celebrate-spin', 'celebrate-spike', 'celebrate-dance'];
                       const anim = anims[Math.floor(Math.random() * anims.length)];
                       skillMarker.classList.add(anim);
                   }
                   if (qbMarker) qbMarker.classList.add('celebrate-spin');

                   const endzone = isHome ? parent.querySelector('.endzone.right') : parent.querySelector('.endzone.left');
                   if (endzone) {
                       endzone.classList.add('endzone-pulse');
                       this.setTimeoutSafe(() => endzone.classList.remove('endzone-pulse'), 2000);
                   }

                   this.fieldEffects.spawnParticles(endPct, 'touchdown');
               }
           }
      } else {
          // Fallback
          await this.animateTrajectory(ballEl, {
              startX: startPct,
              endX: endPct,
              duration: 1000 * durationScale
          });
      }

      // Trigger Effects based on result at end position
      if (this.fieldEffects) {
          if (play.result === 'sack') {
              this.fieldEffects.spawnParticles(endPct, 'sack');
              this.fieldEffects.spawnParticles(endPct, 'shockwave');
          } else if (play.result === 'turnover' || play.result === 'turnover_downs') {
              if (play.playType.includes('pass') || (play.message && play.message.toLowerCase().includes('intercept'))) {
                  this.fieldEffects.spawnParticles(endPct, 'interception');
              } else if (play.message && play.message.toLowerCase().includes('fumble')) {
                  this.fieldEffects.spawnParticles(endPct, 'fumble');
              } else {
                  this.fieldEffects.spawnParticles(endPct, 'shield');
                  this.fieldEffects.spawnParticles(endPct, 'defense_stop');
              }
          } else if (play.result === 'touchdown') {
              this.fieldEffects.spawnParticles(endPct, 'touchdown');
              if (skillMarker) {
                  // Ensure visible for celebration
                  skillMarker.style.opacity = 1;
                  const celeb = Math.random() > 0.5 ? 'celebrate-spike' : 'celebrate-dance';
                  skillMarker.classList.add(celeb);
              }
          } else if (play.message && play.message.includes('First down')) {
              this.fieldEffects.spawnParticles(endPct, 'first_down');
          } else if (play.result === 'big_play') {
              this.fieldEffects.spawnParticles(endPct, 'big_play');
              this.fieldEffects.spawnParticles(endPct, 'shockwave');
          } else if (!['field_goal', 'punt', 'field_goal_miss', 'incomplete'].includes(play.result) && !play.playType.includes('kick') && !play.playType.includes('punt')) {
              this.fieldEffects.spawnParticles(endPct, 'tackle');
          }
      }

      // Cleanup
      this.setTimeoutSafe(() => {
          if (ballEl) ballEl.classList.remove('animate-pulse');
          if (qbMarker) qbMarker.style.opacity = 0;
          if (skillMarker) skillMarker.style.opacity = 0;
          if (defMarker) defMarker.style.opacity = 0;
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

    // Ensure clean state
    this.stopGame();
    this.isGameEnded = false;
    this.isProcessingTurn = false;

    this.userTeamId = userTeamId;

    // Attempt to restore session
    if (this.restoreTempState(homeTeam.id, awayTeam.id)) {
        return;
    }

    // Capture Pre-Game Context
    if (userTeamId !== null && userTeamId !== undefined) {
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
        let stakesReason = '';

        if (userTeam.rivalries && userTeam.rivalries[oppTeam.id]) {
            const rivScore = userTeam.rivalries[oppTeam.id].score;
            if (rivScore > 50) {
                stakesVal += rivScore;
                stakesReason = 'RIVALRY MATCHUP';
            } else {
                stakesVal += rivScore;
            }
        }

        // Playoff Implications (Simple check)
        const week = league?.week || 1;
        if (week > 18) {
            stakesVal += 100;
            stakesReason = 'PLAYOFF ELIMINATION';
        } else if (week > 14) {
            // Late season drama
            const userWins = userTeam.stats?.wins || 0;
            const oppWins = oppTeam.stats?.wins || 0;
            if (Math.abs(userWins - oppWins) <= 1 && userWins > 6) {
                stakesVal += 30;
                if (!stakesReason) stakesReason = 'CRITICAL SEEDING GAME';
            }
        }

        // Calculate Difficulty Label
        const ovrDiff = (userTeam.ovr || 50) - (oppTeam.ovr || 50);
        let difficultyLabel = "Balanced Matchup";
        if (ovrDiff > 5) difficultyLabel = "Favorable Matchup (Easy)";
        else if (ovrDiff < -5) difficultyLabel = "Tough Matchup (Hard)";
        else if (ovrDiff < -10) difficultyLabel = "Nightmare Matchup (Very Hard)";

        // Adaptive AI Logic (Dynamic Difficulty)
        // If user is on a winning streak (>= 3 games), enable Adaptive AI to make it harder
        const userStreak = userTeam.stats?.streak || 0;
        const adaptiveAI = userStreak >= 3;

        if (adaptiveAI) {
            difficultyLabel += " (Adaptive AI Active)";
        }

        // Weather Logic
        const weatherRoll = Math.random();
        let weather = 'clear';
        // Simple seasonality check if week available
        const weekNum = league?.week || 1;
        const isWinter = weekNum > 13; // Late season

        if (isWinter && weatherRoll < 0.20) weather = 'snow';
        else if (weatherRoll < 0.15) weather = 'rain';

        this.preGameContext = {
            matchup: matchupStr,
            difficulty: difficultyLabel,
            offPlanId: plan.offPlanId,
            defPlanId: plan.defPlanId,
            riskId: plan.riskId,
            stakes: stakesVal,
            reason: stakesReason,
            userIsHome: isHome,
            weather: weather,
            adaptiveAI: adaptiveAI
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
    const HOME_ADVANTAGE = C.SIMULATION?.HOME_ADVANTAGE || C.HOME_ADVANTAGE || 2.5;
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

    // Momentum Modifier
    const momentumMod = (gameState.momentum || 0) / 2000;
    const momentumEffect = gameState.ballPossession === 'home' ? momentumMod : -momentumMod;

    // Adaptive AI Difficulty Adjustment
    let adaptiveMod = 0;
    if (this.preGameContext?.adaptiveAI) {
        const isUserOffense = offense.team.id === this.userTeamId;
        const isUserDefense = defense.team.id === this.userTeamId;
        const userLeading = (isUserOffense && offense.score > defense.score) || (isUserDefense && defense.score > offense.score);

        // If User is leading, tilt scales against them slightly to keep it engaging
        if (userLeading) {
             if (isUserOffense) adaptiveMod = -0.05; // User offense struggles more
             else adaptiveMod = 0.05; // AI offense performs better

             // Visual feedback for difficulty increase
             if (Math.random() < 0.05 && !this.isSkipping) {
                 this.triggerFloatText('⚠️ AI ADAPTING', 'warning');
             }
        }
    }

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

    const successChance = Math.max(0.3, Math.min(0.7, 0.5 + (offenseStrength - defenseStrength) / 100 + momentumEffect + adaptiveMod));

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
                recTargets: 0, rec: 0, recYds: 0, recTD: 0,
                xpMade: 0, xpAtt: 0, twoPtMade: 0
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
    const success = U.random() < successChance;
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
        if (U.random() < (0.1 * variance + defModBigPlay)) {
            yards = U.rand(10, 25); // Big play
            momentumChange += 5;
            play.result = 'big_play';
        }
      } else {
        yards = U.rand(-2, 3);
        // Blitz TFL chance
        if (U.random() < defModSack * 0.5) {
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
      const target = targets.length > 0 ? targets[Math.floor(U.random() * targets.length)] : null;
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
      if (U.random() < (0.05 + defModSack)) {
          yards = -U.rand(5, 10);
          play.result = 'sack';
          play.message = 'SACKED!';
          momentumChange -= 10;

          if (qb) {
             const qbStats = ensureStats(qb.id, qb.name, qb.pos, offense.team.id);
             qbStats.rushAtt++;
          }
      } else if (U.random() < (successChance + completeBonus)) {
        // Completion
        yards = Math.max(1, Math.round(U.rand(5, 15) + yardBonus + defModPass));

        // Big play
        if (U.random() < (bigPlayChance + defModBigPlay)) {
            yards = U.rand(20, 50);
            momentumChange += 10;
            play.result = 'big_play';
        }

        // Interception
        if (U.random() < (intChance + defModInt)) {
          play.result = 'turnover'; // Standardize to turnover

          // Calculate interception depth for visual animation and field position
          const interceptDepth = Math.floor(U.rand(5, 25));
          yards = interceptDepth;

          play.message = `${offense.qb?.name || 'QB'} pass intercepted!`;
          momentumChange -= 20;

          if (qb) {
             const qbStats = ensureStats(qb.id, qb.name, qb.pos, offense.team.id);
             qbStats.passInt++;
          }

          // Calculate turnover spot
          const currentYard = gameState[gameState.ballPossession].yardLine;
          const interceptPoint = Math.min(99, currentYard + interceptDepth);
          let nextStart = 100 - interceptPoint;
          if (nextStart < 1) nextStart = 20; // Touchback safety

          this.switchPossession(gameState, nextStart);

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
      
      if (U.random() < successChance * (kickStrength / 100)) {
        play.result = 'field_goal';
        play.message = `Field goal is GOOD! (${distance} yards)`;
        offense.score += 3;

        // Update Quarter Score
        const qIdx = gameState.quarter - 1;
        if (gameState.quarterScores[gameState.ballPossession][qIdx] !== undefined) {
            gameState.quarterScores[gameState.ballPossession][qIdx] += 3;
        }
        momentumChange += 5;
        this.switchPossession(gameState); // Kickoff next (assume touchback for now)
      } else {
        play.result = 'field_goal_miss';
        play.message = `Field goal is NO GOOD (${distance} yards)`;
        momentumChange -= 10;
        // Turnover at spot of kick (approx LOS)
        const turnoverYard = 100 - gameState[gameState.ballPossession].yardLine;
        this.switchPossession(gameState, turnoverYard);
      }
    } else if (playType === 'punt') {
      yards = U.rand(35, 50);
      play.message = `Punt ${yards} yards`;

      const currentYard = gameState[gameState.ballPossession].yardLine;
      const landingYard = currentYard + yards;
      // Flip for opponent: 100 - landingYard. Cap at 20 for touchback if > 100
      let nextStart = 100 - landingYard;
      if (nextStart < 0) {
          play.message += " (Touchback)";
          nextStart = 20;
      } else if (nextStart > 99) {
          nextStart = 99; // Safety safety? No, punting from own end zone.
      }

      this.switchPossession(gameState, nextStart);
    }

    // Update Momentum
    gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? momentumChange : -momentumChange)));

    // Update Drive Momentum
    if (yards > 0) {
        this.driveMomentum = Math.min(100, this.driveMomentum + yards + (play.result === 'big_play' ? 15 : 0));
    } else if (play.result === 'sack' || play.result === 'turnover') {
        this.driveMomentum = 0;
    }

    // Update yard line and down/distance
    if (play.result !== 'turnover' && play.result !== 'field_goal' && play.result !== 'field_goal_miss') {
      const newYardLine = gameState[gameState.ballPossession].yardLine + yards;
      gameState.drive.yards += yards;

      if (newYardLine >= 100) {
        // Touchdown!
        play.result = 'touchdown';
        play.message = `TOUCHDOWN! ${offense.team.name || offense.team.abbr}`;
        offense.score += 6;

        // Update Quarter Score
        const qIdx = gameState.quarter - 1;
        if (gameState.quarterScores[gameState.ballPossession][qIdx] !== undefined) {
            gameState.quarterScores[gameState.ballPossession][qIdx] += 6;
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

        // Extra Point / 2-Point Conversion Logic
        const scoreDiff = offense.score - defense.score; // After TD (6 pts added)
        let attemptedTwoPoint = false;
        let pointsAdded = 0;

        // Logic: Go for 2 if...
        // 1. Trailing by 2 (to tie)
        // 2. Trailing by 1 (to win - aggressive)
        // 3. Random small chance (analytics)
        if (scoreDiff === -2 || (scoreDiff === -1 && gameState.quarter === 4 && gameState.time < 120)) {
            attemptedTwoPoint = true;
        } else if (U.random() < 0.05) {
            attemptedTwoPoint = true;
        }

        if (attemptedTwoPoint) {
            // ~48% success rate for 2PT
            if (U.random() < 0.48) {
                pointsAdded = 2;
                play.message += " (2-Pt Conversion GOOD)";
                this.triggerVisualFeedback('two-point', '2 POINTS!');

                // Credit Scorer (Runner or Receiver)
                if (player) {
                     const pStats = ensureStats(player.id, player.name, player.pos, offense.team.id);
                     pStats.twoPtMade = (pStats.twoPtMade || 0) + 1;
                } else if (offense.qb) {
                     // Fallback
                     const qbStats = ensureStats(offense.qb.id, offense.qb.name, offense.qb.pos, offense.team.id);
                     qbStats.twoPtMade = (qbStats.twoPtMade || 0) + 1;
                }
            } else {
                play.message += " (2-Pt Conversion FAILED)";
                this.triggerVisualFeedback('two-point-miss', 'FAILED');
            }
        } else {
            // Extra Point (~94% success)
            const kicker = offense.players.k;
            const kickAcc = kicker?.ratings?.kickAccuracy || 75;
            // Base 94% + accuracy modifier
            const successChance = 0.94 + ((kickAcc - 70) * 0.002);

            if (U.random() < successChance) {
                pointsAdded = 1;
                play.message += " (XP Good)";
                // Update Kicker Stats
                if (kicker) {
                    const kStats = ensureStats(kicker.id, kicker.name, kicker.pos, offense.team.id);
                    kStats.xpMade = (kStats.xpMade || 0) + 1;
                    kStats.xpAtt = (kStats.xpAtt || 0) + 1;
                }
            } else {
                play.message += " (XP Missed)";
                this.triggerVisualFeedback('missed-xp', 'XP MISSED');
                soundManager.playCrowdGasp();
                if (kicker) {
                    const kStats = ensureStats(kicker.id, kicker.name, kicker.pos, offense.team.id);
                    kStats.xpAtt = (kStats.xpAtt || 0) + 1;
                }
            }
        }

        offense.score += pointsAdded;
        if (gameState.quarterScores[gameState.ballPossession][qIdx] !== undefined) {
             gameState.quarterScores[gameState.ballPossession][qIdx] += pointsAdded;
        }

        momentumChange += 15 + pointsAdded;
        gameState.momentum = Math.max(-100, Math.min(100, gameState.momentum + (gameState.ballPossession === 'home' ? (15+pointsAdded) : -(15+pointsAdded))));

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
             // After safety, team punts from own 20. Receiving team gets it around midfield/35.
             // switchPossession arg is 'yards from own goal', so 35 means own 35.
             this.switchPossession(gameState, 35);
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
        return distance <= 3 ? ((window.Utils?.random || Math.random)() < 0.5 ? 'run' : 'pass') : 'punt';
      }
    }

    // Normal play selection
    let type = 'run';
    if (down === 1 || down === 2) {
      type = (window.Utils?.random || Math.random)() < 0.6 ? 'pass' : 'run';
    } else {
      // 3rd down - more likely to pass
      type = (window.Utils?.random || Math.random)() < 0.7 ? 'pass' : 'run';
    }

    // Add subtypes
    if (type === 'run') {
        return (window.Utils?.random || Math.random)() < 0.6 ? 'run_inside' : 'run_outside';
    } else {
        const r = (window.Utils?.random || Math.random)();
        if (r < 0.3) return 'pass_short';
        if (r < 0.7) return 'pass_medium';
        return 'pass_long';
    }
  }

  /**
   * Switch ball possession
   */
  switchPossession(gameState, startYardLine = 25) {
    // Generate Drive Summary
    const drive = gameState.drive;
    const timeElapsed = Math.max(0, drive.startTime - gameState.time);
    const summary = `Drive Summary: ${drive.plays} plays, ${drive.yards} yards, ${this.formatTime(timeElapsed)}`;

    // Render Drive Summary
    this.renderPlay({
        type: 'drive_summary',
        message: summary
    });

    // Visual Feedback for Possession Change
    if (!this.isSkipping) {
        // Delay slightly to not overlap with previous play feedback
        this.setTimeoutSafe(() => {
             this.triggerVisualFeedback('drive-summary', 'CHANGE OF POSSESSION');
        }, 1500);
    }

    // Reset Drive Stats
    gameState.drive = {
        plays: 0,
        yards: 0,
        startTime: gameState.time,
        startYardLine: startYardLine
    };

    this.driveMomentum = 0;

    gameState.ballPossession = gameState.ballPossession === 'home' ? 'away' : 'home';
    const newOffense = gameState[gameState.ballPossession];
    newOffense.down = 1;
    newOffense.distance = 10;
    newOffense.yardLine = startYardLine; // Use dynamic start position
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
      this.showQuarterOverlay(gameState.quarter - 1);
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
          const winner = (window.Utils?.random || Math.random)() < 0.5 ? 'home' : 'away';
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

    // Play kickoff sound if starting from beginning
    if (this.currentPlayIndex === 0 && soundManager.playGameStart) {
        soundManager.playGameStart();
    }

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
    // Only animate ONCE. The play object contains the result (yards, etc),
    // but startState tracks where we began (for the animation start point).
    if (play.type === 'play') {
        await this.animatePlay(play, startState);
        // RACE CHECK: If skipping or ended during animation, abort
        if (this.isGameEnded || this.isSkipping) {
            this.isProcessingTurn = false;
            return;
        }
    }

    this.playByPlay.push(play);
    this.currentPlayIndex = this.playByPlay.length;

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

    // Huddle Feedback
    if (delay > 1500) {
        this.showHuddleFeedback();
    }

    this.intervalId = this.setTimeoutSafe(() => {
      if (!this.isPaused) {
        this.displayNextPlay();
      }
    }, delay);
  }

  showHuddleFeedback() {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;
      const ddEl = parent.querySelector('.down-distance');
      if (ddEl && !ddEl.querySelector('.huddle-text')) {
          const span = document.createElement('span');
          span.className = 'huddle-text';
          span.textContent = '(Huddle)';
          ddEl.appendChild(span);
      }
  }

  updateControls() {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;

      const disable = this.isProcessingTurn;

      // Disable navigation controls during play animation, but keep Play/Pause/Tempo active
      const selectors = ['#btnPrevPlay', '#btnNextPlay', '#btnNextDrive', '#btnSkipEnd'];

      selectors.forEach(sel => {
          const btn = parent.querySelector(sel);
          if (btn) {
              btn.disabled = disable;
              btn.style.opacity = disable ? '0.5' : '1';
              btn.style.cursor = disable ? 'not-allowed' : 'pointer';
          }
      });
  }

  /**
   * Get delay between plays based on tempo and context
   */
  getPlayDelay() {
    let baseDelay = 900;

    // Adjust based on tempo
    if (this.tempo === 'hurry-up') baseDelay = 200;
    else if (this.tempo === 'slow') baseDelay = 3000;

    // Context-aware pacing: Check last play result
    if (this.playByPlay.length > 0) {
        const lastPlay = this.playByPlay[this.playByPlay.length - 1];
        if (lastPlay) {
            if (lastPlay.result === 'touchdown') baseDelay += 2000; // Let celebration breathe
            else if (lastPlay.result === 'turnover' || lastPlay.result === 'turnover_downs') baseDelay += 1500;
            else if (lastPlay.result === 'big_play') baseDelay += 1000;
            else if (lastPlay.result === 'incomplete') {
                if (this.tempo !== 'slow') baseDelay = Math.max(400, baseDelay - 400); // Speed up after incomplete
            }
        }
    }

    return baseDelay;
  }


  /**
   * Render a play to the UI
   */
  renderPlay(play) {
    if (!this.checkUI()) return; // Safety guard

    // Update Combo State
    let comboIncreased = false;
    let comboBroken = false;
    if (this.userTeamId != null) {
        // Only track combo if it relates to user
        const isUserOffense = play.offense === this.userTeamId;
        const isUserDefense = play.defense === this.userTeamId;

        if (isUserOffense) {
            if (play.result === 'touchdown' || play.result === 'field_goal' || play.result === 'big_play' || (play.yards >= 10 && !play.result)) {
                this.combo++;
                comboIncreased = true;
            } else if (play.result === 'turnover' || play.result === 'turnover_downs' || play.result === 'sack' || play.yards < 0) {
                if (this.combo > 1) comboBroken = true;
                this.combo = 0;
            }
        } else if (isUserDefense) {
            if (play.result === 'turnover' || play.result === 'turnover_downs' || play.result === 'sack' || play.yards <= 0) {
                this.combo++;
                comboIncreased = true;
            } else if (play.result === 'touchdown' || play.result === 'field_goal' || play.result === 'big_play' || play.yards >= 10) {
                if (this.combo > 1) comboBroken = true;
                this.combo = 0;
            }
        }
    }

    // Sound & Juice Triggers
    if (!this.isSkipping) {
        // Combo Feedback
        if (comboIncreased && this.combo > 1) {
             this.triggerFloatText(`COMBO x${this.combo}!`, 'positive');
             soundManager.playPing();
        }
        if (comboBroken) {
             this.triggerFloatText('COMBO BROKEN', 'negative');
             if (soundManager.playComboBreaker) soundManager.playComboBreaker();
             else soundManager.playFailure();
        }

        // Momentum Shift Logic
        const currentMomentum = this.gameState.momentum;
        const prevMomentum = this.lastMomentum !== undefined ? this.lastMomentum : 0;
        if (Math.abs(currentMomentum - prevMomentum) > 30 || (prevMomentum < 0 && currentMomentum > 0) || (prevMomentum > 0 && currentMomentum < 0)) {
            if (soundManager.playMomentumShift) soundManager.playMomentumShift();
        }
        this.lastMomentum = currentMomentum;

        if (play.message && play.message.includes('First down!')) {
             soundManager.playFirstDown();
        }

        if (play.result === 'touchdown') {
            soundManager.playTouchdown();
            this.setTimeoutSafe(() => soundManager.playHorns(), 500); // Delayed horns
            soundManager.playCheer();
            this.triggerFlash();
            this.triggerShake('hard'); // Intense shake
            this.triggerFloatText('TOUCHDOWN!');
            if (launchConfetti) launchConfetti('cannon');
            if (soundManager && soundManager.playCannon) soundManager.playCannon();
            this.triggerVisualFeedback('goal touchdown', 'TOUCHDOWN!');
            // Ensure particles trigger even if animation skipped slightly
            if (this.fieldEffects) {
                 const isHome = this.gameState.ballPossession === 'home';
                 const yardLine = this.gameState[this.gameState.ballPossession].yardLine;
                 const pct = this.getVisualPercentage(yardLine, isHome);
                 this.fieldEffects.spawnParticles(pct, 'touchdown');
            }
        } else if (play.result === 'turnover' || play.result === 'turnover_downs') {
            if (play.playType.includes('pass')) soundManager.playIntercept();
            else soundManager.playFumble();

            soundManager.playDefenseStop();

            if (play.message && play.message.toLowerCase().includes('intercept')) {
                 soundManager.playInterception();
            } else if (play.message && play.message.toLowerCase().includes('fumble')) {
                 soundManager.playFumble();
            } else {
                 soundManager.playDefenseStop();
            }
            soundManager.playFailure();
            // Intense shake
            this.triggerShake('hard');

            if (play.result === 'turnover_downs') {
                this.triggerVisualFeedback('save defense-stop', 'STOPPED!');
            } else if (play.message && play.message.toLowerCase().includes('intercept')) {
                this.triggerVisualFeedback('save interception', 'INTERCEPTED!');
            } else if (play.message && play.message.toLowerCase().includes('fumble')) {
                this.triggerVisualFeedback('save fumble', 'FUMBLE!');
            } else {
                this.triggerVisualFeedback('save turnover', 'TURNOVER!');
            }

            this.triggerShake('hard');
            this.triggerFloatText('TURNOVER!', 'bad');
        } else if (play.result === 'field_goal_miss') {
            soundManager.playFieldGoalMiss();
            soundManager.playCrowdGasp();
            this.triggerShake();
            this.triggerFloatText('NO GOOD!', 'bad');
            this.triggerVisualFeedback('save defense-stop', 'NO GOOD!');
        } else if (play.result === 'sack') {
            soundManager.playSack();
            soundManager.playShockwave();
            this.triggerShake('hard');
            this.triggerFloatText('SACKED!', 'bad');
            this.triggerVisualFeedback('save sack', 'SACK!');
        } else if (play.result === 'big_play') {
            if (soundManager.playBigPlay) soundManager.playBigPlay();
            else soundManager.playCheer();
            this.triggerFlash();
            this.triggerFloatText('BIG PLAY!');

            if (this.fieldEffects) {
                const isHome = this.gameState.ballPossession === 'home';
                const yardLine = play.yardLine; // Start
                const endPct = this.getVisualPercentage(Math.min(100, Math.max(0, yardLine + play.yards)), isHome);
                this.fieldEffects.spawnParticles(endPct, 'big_play');
            }
        } else if (play.result === 'field_goal') {
            soundManager.playFieldGoal();
            soundManager.playKick();
            this.triggerFloatText('GOOD!');
            this.triggerVisualFeedback('goal field-goal-made', 'FIELD GOAL!');
            if (launchConfetti) launchConfetti();
        } else if (play.playType === 'punt') {
            soundManager.playKick();
            this.triggerVisualFeedback('kick punt', 'PUNT');
        } else if (play.type === 'game_end') {
            // Check winner
            const userWon = (this.userTeamId && ((this.gameState.home.team.id === this.userTeamId && this.gameState.home.score > this.gameState.away.score) || (this.gameState.away.team.id === this.userTeamId && this.gameState.away.score > this.gameState.home.score)));
            if (userWon) {
                soundManager.playCheer();
                soundManager.playHorns();
                soundManager.playVictory();
                if (launchConfetti) launchConfetti('victory');
                this.triggerVisualFeedback('goal victory', 'VICTORY!');
            } else {
                soundManager.playWhistle();
                this.triggerVisualFeedback('save defeat', 'GAME OVER');
            }
             soundManager.playPing();
        } else if (play.result === 'field_goal_miss') {
             soundManager.playFailure();
             this.triggerVisualFeedback('save defense-stop', 'NO GOOD!');
        } else if (play.result === 'safety') {
             soundManager.playFailure();
             this.triggerVisualFeedback('save safety', 'SAFETY!');
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
   * Trigger visual feedback for game events
   */
  triggerVisualFeedback(type, text) {
    if (!this.checkUI()) return;
    const parent = this.viewMode ? this.container : this.modal.querySelector('.modal-content');

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = `game-event-overlay ${type} pop-in`;
    overlay.innerHTML = `<div class="event-text">${text}</div>`;

    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    parent.appendChild(overlay);

    // Remove after animation
    this.setTimeoutSafe(() => {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    }, 2000);
  }

  /**
   * Animate a number from start to end
   */
  animateNumber(element, start, end, duration = 1000) {
      if (start === end || !element) return;

      // Mark as animating
      element.setAttribute('data-animating', 'true');

      const range = end - start;
      const startTime = performance.now();

      const step = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // EaseOutCubic
          const ease = 1 - Math.pow(1 - progress, 3);

          const current = Math.floor(start + (range * ease));
          element.textContent = current;

          if (progress < 1) {
              requestAnimationFrame(step);
          } else {
              element.textContent = end;
              element.removeAttribute('data-animating');
          }
      };

      requestAnimationFrame(step);
  }

  /**
   * Update scoreboard display
   */
  updateScoreboard(force = false) {
    if (!this.checkUI(force)) return; // Safety guard
    const parent = this.viewMode ? this.container : this.modal;

    const scoreboard = parent.querySelector('.scoreboard');
    if (!scoreboard || !this.gameState) return;

    const home = this.gameState.home;
    const away = this.gameState.away;
    const state = this.gameState;

    // Detect score change
    const homeChanged = this.lastHomeScore !== undefined && this.lastHomeScore !== home.score;
    const awayChanged = this.lastAwayScore !== undefined && this.lastAwayScore !== away.score;

    // Elements
    let scoreHomeEl = scoreboard.querySelector('#scoreHome');
    let scoreAwayEl = scoreboard.querySelector('#scoreAway');
    let homeBox = scoreboard.querySelector('#homeTeamBox');
    let awayBox = scoreboard.querySelector('#awayTeamBox');
    let clockEl = scoreboard.querySelector('.game-clock');
    let ddEl = scoreboard.querySelector('.down-distance');

    // Initial Render
    if (!scoreHomeEl) {
        const displayHome = homeChanged ? this.lastHomeScore : home.score;
        const displayAway = awayChanged ? this.lastAwayScore : away.score;

        scoreboard.innerHTML = `
          <div class="score-team ${state.ballPossession === 'away' ? 'has-possession' : ''}" id="awayTeamBox">
            <div class="team-name">${away.team.abbr}</div>
            <div class="team-score" id="scoreAway" style="${displayAway.toString().length > 2 ? 'font-size: 1.5rem;' : ''}">${displayAway}</div>
          </div>
          <div class="score-info">
            <div class="game-clock">Q${state.quarter} ${this.formatTime(state.time)}</div>
            <div class="down-distance">
              ${state[state.ballPossession].down} & ${state[state.ballPossession].distance} at ${state[state.ballPossession].yardLine}
            </div>
          </div>
          <div class="score-team ${state.ballPossession === 'home' ? 'has-possession' : ''}" id="homeTeamBox">
            <div class="team-name">${home.team.abbr}</div>
            <div class="team-score" id="scoreHome" style="${displayHome.toString().length > 2 ? 'font-size: 1.5rem;' : ''}">${displayHome}</div>
          </div>
        `;
        // Re-query elements
        scoreHomeEl = scoreboard.querySelector('#scoreHome');
        scoreAwayEl = scoreboard.querySelector('#scoreAway');
        homeBox = scoreboard.querySelector('#homeTeamBox');
        awayBox = scoreboard.querySelector('#awayTeamBox');
    } else {
        // Update Non-Score Elements
        if (clockEl) clockEl.textContent = `Q${state.quarter} ${this.formatTime(state.time)}`;
        if (ddEl) ddEl.textContent = `${state[state.ballPossession].down} & ${state[state.ballPossession].distance} at ${state[state.ballPossession].yardLine}`;

        if (homeBox) {
            if (state.ballPossession === 'home') homeBox.classList.add('has-possession');
            else homeBox.classList.remove('has-possession');
        }
        if (awayBox) {
            if (state.ballPossession === 'away') awayBox.classList.add('has-possession');
            else awayBox.classList.remove('has-possession');
        }

        // Sync score if not changing (and not animating)
        if (!homeChanged && scoreHomeEl && !scoreHomeEl.hasAttribute('data-animating')) {
             scoreHomeEl.textContent = home.score;
        }
        if (!awayChanged && scoreAwayEl && !scoreAwayEl.hasAttribute('data-animating')) {
             scoreAwayEl.textContent = away.score;
        }
    }

    // Trigger animations explicitly
    if (homeChanged && scoreHomeEl) {
        scoreHomeEl.classList.remove('pulse-score-strong');
        void scoreHomeEl.offsetWidth; // Reflow
        scoreHomeEl.classList.add('pulse-score-strong');

        if (home.score.toString().length > 2) scoreHomeEl.style.fontSize = '1.5rem';
        if (homeBox) {
             homeBox.classList.remove('pulse-score-strong');
             void homeBox.offsetWidth;
             homeBox.classList.add('pulse-score-strong');
        }
        this.animateNumber(scoreHomeEl, this.lastHomeScore, home.score, 1000);
    }
    if (awayChanged && scoreAwayEl) {
        scoreAwayEl.classList.remove('pulse-score-strong');
        void scoreAwayEl.offsetWidth;
        scoreAwayEl.classList.add('pulse-score-strong');

        if (away.score.toString().length > 2) scoreAwayEl.style.fontSize = '1.5rem';
        if (awayBox) {
             awayBox.classList.remove('pulse-score-strong');
             void awayBox.offsetWidth;
             awayBox.classList.add('pulse-score-strong');
        }
        this.animateNumber(scoreAwayEl, this.lastAwayScore, away.score, 1000);
    }

    this.lastHomeScore = home.score;
    this.lastAwayScore = away.score;
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
    this.inputLocked = false;
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
                    if (this.playCallQueue || this.inputLocked) return; // Prevent rapid fire
                    this.inputLocked = true;

                    // Visual feedback & Disable
                    pcContainer.querySelectorAll('.play-call-btn').forEach(b => {
                        b.classList.remove('selected');
                        b.disabled = true; // Disable all buttons
                        b.style.pointerEvents = 'none';
                    });

                    e.target.classList.add('selected');
                    if (soundManager && soundManager.playPing) soundManager.playPing();

                    // Small delay to show feedback before hiding
                    this.setTimeoutSafe(() => {
                        this.callPlay(e.target.dataset.play);
                    }, 150);
                });
            });
        }
    }

    const playCalling = parent.querySelector('.play-calling');
    if (!playCalling) return;

    // Reset buttons state if reused
    if (this.viewMode) {
        const pcContainer = parent.querySelector('.play-calling');
        if (pcContainer) {
             pcContainer.querySelectorAll('.play-call-btn').forEach(b => {
                 b.disabled = false;
                 b.style.pointerEvents = 'auto';
                 b.classList.remove('selected');
             });
        }
    }

    playCalling.style.display = 'flex';
    void playCalling.offsetWidth; // Force reflow for transition
    playCalling.classList.add('visible');

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
      playCalling.classList.remove('visible');
      this.setTimeoutSafe(() => {
          if (!playCalling.classList.contains('visible')) {
              playCalling.style.display = 'none';
          }
      }, 300);
    }
    this.isPaused = false;
  }

  /**
   * User calls a play
   */
  callPlay(playType) {
    if (this.playCallQueue) return;
    this.playCallQueue = playType;
    this.hidePlayCalling();
    
    // Continue game
    if (this.isPlaying) {
      this.displayNextPlay();
    }
  }

  /**
   * Skip to end of game
   * Uses async chunking to prevent UI freeze
   */
  skipToEnd() {
      if (this.isSkipping) return;

      // Set skipping flag IMMEDIATELY to short-circuit any running animations
      this.isSkipping = true;
      this.toggleControls(false);

      // Fade out for smoothness
      if (this.viewMode && this.container) {
          this.container.classList.add('fade-transition', 'hidden');
      }

      if (this.intervalId) {
          clearTimeout(this.intervalId);
          this.intervalId = null;
      }
      if (this.isGameEnded) return;

      this.isPaused = false;
      this.isPlaying = true;

      let totalPlays = 0;
      const MAX_PLAYS = 1000; // Safety break for infinite loops

      const processChunk = () => {
          // Safety check for destroyed game
          if (!this.gameState || this.isGameEnded) return;

          const startTime = performance.now();
          const TIME_BUDGET = 12; // 12ms per frame (target 60fps with overhead)

          while (!this.gameState.gameComplete && totalPlays < MAX_PLAYS) {
              // Time check
              if (performance.now() - startTime > TIME_BUDGET) {
                  requestAnimationFrame(processChunk);
                  return;
              }

              totalPlays++;

              const state = this.gameState;
              const offense = state.ballPossession === 'home' ? state.home : state.away;
              const defense = state.ballPossession === 'home' ? state.away : state.home;
              const isUserOffense = offense.team.id === this.userTeamId;

              // Auto-pick for user (AI)
              const play = this.generatePlay(offense, defense, state, isUserOffense, null, null);

              this.playByPlay.push(play);
              // Only render if skipping is slow or we want logs, but for speed we skip rendering intermediate plays
              // However, we DO update the state
              // OPTIMIZATION: Skip visual updates during fast-forward
              // this.updateGameState(play, state);
              this.handleEndOfQuarter(state);
          }

          if (this.gameState.gameComplete || totalPlays >= MAX_PLAYS) {
              this.isSkipping = false;

              // 1. SAVE FIRST (Persistence)
              this.finalizeGame();

              // 2. Update UI if it exists (Safe DOM Access)
              if (this.checkUI()) {
                  this.renderGame();

                  // Fade back in
                  if (this.viewMode && this.container) {
                      this.container.classList.remove('hidden');
                      this.setTimeoutSafe(() => this.container.classList.remove('fade-transition'), 300);
                  }

                  // Scroll log to bottom safely
                  const parent = this.viewMode ? this.container : this.modal;
                  if (parent) {
                     const playLog = parent.querySelector(this.viewMode ? '.play-log-enhanced' : '.play-log');
                     if (playLog) playLog.scrollTop = playLog.scrollHeight;
                  }
              }

              // 3. Cleanup
              this.endGame();
          } else {
              // Schedule next chunk (redundant if loop broke due to time, but safe)
              requestAnimationFrame(processChunk);
          }
      };

      // Start processing
      requestAnimationFrame(processChunk);
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
        const userTeam = this.userTeamId != null ? (this.gameState.home.team.id === this.userTeamId ? this.gameState.home : this.gameState.away) : null;

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

      // Calculate MVP
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

      // Calculate Fan Grade & XP
      let xp = 100; // Base
      let grade = 'C';

      const isHome = this.gameState.home.team.id === this.userTeamId;
      const userTeam = isHome ? this.gameState.home.team : this.gameState.away.team;
      const oppTeam = isHome ? this.gameState.away.team : this.gameState.home.team;
      const diff = scoreA - scoreB; // Already user vs opp in call? No, title/scoreA is generic.

      // We need to know who scoreA is. The caller passes userScore as A, oppScore as B.
      // So scoreA = userScore.

      if (scoreA > scoreB) {
          xp += 50; // Win bonus
          if (scoreA - scoreB > 14) { grade = 'A+'; xp += 25; }
          else if (scoreA > 28) grade = 'A';
          else grade = 'B';
      } else {
          if (scoreB - scoreA < 7) { grade = 'C+'; xp += 10; } // Close loss
          else if (scoreB - scoreA > 20) grade = 'F';
          else grade = 'D';
      }

      // Add stats bonuses
      // (Simplified for now, could access this.gameState.stats)

      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';

      let bannerClass = 'game-over-banner';
      if (type === 'positive') bannerClass += ' victory';
      if (type === 'negative') bannerClass += ' defeat';

      let mainColor = '#fff';
      if (type === 'positive') mainColor = userTeam.color || '#34C759';
      else if (type === 'negative') mainColor = oppTeam.color || '#FF453A';

      if (type === 'positive') soundManager.playTouchdown();
      else if (type === 'negative') soundManager.playFailure();

      overlay.innerHTML = `
        <div class="${bannerClass}" style="
            border-color: ${mainColor};
            box-shadow: 0 0 60px ${mainColor}60;
            background: linear-gradient(135deg, rgba(0,0,0,0.95), ${mainColor}20);
        ">
            <div style="font-size: 5rem; margin-bottom: 10px; animation: bounce 1s;">
                ${type === 'positive' ? '🏆' : (type === 'negative' ? '💔' : '🤝')}
            </div>
            <h2 style="
                color: ${mainColor};
                text-shadow: 0 0 30px ${mainColor}80;
                font-size: 4rem;
                margin-bottom: 10px;
                text-transform: uppercase;
                letter-spacing: 4px;
            ">${title}</h2>
            <div class="game-over-score" style="font-size: 3.5rem; font-weight: 900; margin-bottom: 20px;">
                ${scoreA} - ${scoreB}
            </div>

            <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; min-width: 100px;">
                    <div style="font-size: 0.8rem; text-transform: uppercase; color: #aaa;">Fan Grade</div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: ${grade.startsWith('A') ? '#4cd964' : (grade === 'F' ? '#ff3b30' : '#fff')}">${grade}</div>
                </div>
                 <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; min-width: 100px;">
                    <div style="font-size: 0.8rem; text-transform: uppercase; color: #aaa;">XP Earned</div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: #ffd700;">+${xp}</div>
                </div>
            </div>

            ${mvp ? `
            <div class="game-over-mvp" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                <div class="label" style="font-size: 0.8rem; text-transform: uppercase; color: #aaa; letter-spacing: 2px;">Player of the Game</div>
                <div class="player-name" style="font-size: 1.4rem; font-weight: bold; margin: 5px 0;">${mvp.name}</div>
                <div class="player-stats" style="color: #ccc; font-size: 0.9rem;">
                    ${mvp.pos} •
                    ${mvp.passYds ? mvp.passYds + ' Pass Yds, ' : ''}
                    ${mvp.rushYds ? mvp.rushYds + ' Rush Yds, ' : ''}
                    ${mvp.recYds ? mvp.recYds + ' Rec Yds, ' : ''}
                    ${(mvp.passTD || mvp.rushTD || mvp.recTD) ? (mvp.passTD||0)+(mvp.rushTD||0)+(mvp.recTD||0) + ' TDs' : ''}
                </div>
            </div>
            ` : ''}

            <div style="margin-top: 30px; display: flex; gap: 10px; justify-content: center;">
                <button class="btn primary" id="dismissOverlay" style="font-size: 1.1rem; padding: 10px 30px;">Continue</button>
                <button class="btn secondary" id="replayGame" style="font-size: 1.1rem; padding: 10px 20px;">🔄 Replay</button>
            </div>
        </div>
      `;

      if (getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
      }

      parent.appendChild(overlay);

      overlay.querySelector('#dismissOverlay').addEventListener('click', () => {
          overlay.remove();
      });

      overlay.querySelector('#replayGame').addEventListener('click', () => {
           overlay.remove();
           // Restart Game
           if (this.userTeamId && this.gameState) {
                // Find teams again from ID to be safe
                const hId = this.gameState.home.team.id;
                const aId = this.gameState.away.team.id;
                window.watchLiveGame(hId, aId);
           }
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

            // Explicitly save state since commitGameResult is pure
            if (window.saveGame) {
                window.saveGame();
            } else if (window.saveState) {
                window.saveState();
            }

            if (window.setStatus) window.setStatus("Game Saved!", "success");
        } else {
            console.error("Failed to finalize game: Result was null");
            if (window.setStatus) window.setStatus("Error: Could not save game result. Please try again.", "error");
            this.hasAppliedResult = false;
        }
    } catch (e) {
        console.error("Exception in finalizeGame:", e);
        if (window.setStatus) window.setStatus("CRITICAL ERROR SAVING GAME", "error");
        this.hasAppliedResult = false;
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
          <button class="control-btn tempo-btn active" data-tempo="normal">Normal</button>
          <button class="control-btn tempo-btn" data-tempo="hurry-up">Hurry-Up</button>
          <button class="control-btn tempo-btn" data-tempo="slow">Slow</button>
          <button class="control-btn pause-btn">⏸ Pause</button>
          <button class="control-btn skip-btn" style="background: var(--danger, #dc3545); color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Skip to End</button>
        </div>

        <div class="game-dashboard" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; background: rgba(0,0,0,0.2); margin-top: 10px; border-radius: 8px;">
            <div class="box-score-panel"></div>
            <div class="momentum-panel"></div>
        </div>
        <div class="stats-panel"></div>

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
          <button class="control-btn close-game-btn">Close</button>
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
        if (this.playCallQueue) return; // Prevent rapid fire

        // Visual feedback
        modal.querySelectorAll('.play-call-btn').forEach(b => {
            b.classList.remove('selected');
            b.disabled = true;
            b.style.pointerEvents = 'none';
        });

        e.target.classList.add('selected');

        this.setTimeoutSafe(() => {
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
   * Update Field Visualization
   */
  updateField(state) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;

      // Use the robust updateFieldState logic for markers/ball
      if (state) {
          const currentPossession = state[state.ballPossession];
          this.updateFieldState(currentPossession.yardLine, state.ballPossession === 'home');
      }

      // Handle Red Zone (extra visual)
      const fieldContainer = parent.querySelector('.football-field-container') || parent.querySelector('.field-container');
      if (state && fieldContainer) {
          const currentPossession = state[state.ballPossession];
          const isRedZone = (state.ballPossession === 'home' && currentPossession.yardLine >= 80) ||
                            (state.ballPossession === 'away' && currentPossession.yardLine <= 20);

          if (isRedZone) fieldContainer.classList.add('red-zone');
          else fieldContainer.classList.remove('red-zone');
      }
  }

  /**
   * Render game UI
   */
  renderGame(force = false) {
    if (!this.checkUI(force)) return;
    if (!this.gameState) return;

    // Ensure field is rendered if empty (using the wrapper)
    const parent = this.viewMode ? this.container : this.modal;
    const fieldWrapper = parent.querySelector('.field-wrapper');
    if (fieldWrapper && !fieldWrapper.hasChildNodes()) {
        this.renderField(fieldWrapper);
    }

    this.updateScoreboard(force);
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

      // Fire logic for high momentum
      if (Math.abs(m) > 75 && Date.now() - this.lastFireTime > 1000) {
          if (this.fieldEffects) {
              this.fieldEffects.spawnParticles(50, 'fire');
          }
          this.lastFireTime = Date.now();
      }

      // Streak indicator (using Combo for consecutive plays)
      let streakHtml = '';
      if (this.combo >= 3) {
          streakHtml = `<div class="streak-fire">🔥 ON FIRE! 🔥</div>`;
      }
      // Combo indicator
      if (this.combo > 0) {
          streakHtml += `
            <div class="streak-text" style="text-align:center; margin-top: 5px;">
                <span style="font-size: 1.2em; font-weight: 900; color: #ffeb3b; text-shadow: 0 0 10px #ffc107;">COMBO</span>
                <span style="font-size: 1.5em; font-weight: 900; color: #fff;">x${this.combo}</span>
            </div>
            <div class="combo-bar-container">
                ${Array.from({length: 5}, (_, i) =>
                    `<div class="combo-bar-segment ${i < this.combo ? (this.combo >= 5 ? 'max' : 'active') : ''}"></div>`
                ).join('')}
            </div>
          `;
      }

      container.innerHTML = `
        <div style="text-align: center; font-size: 0.8em; margin-bottom: 4px; color: var(--text-muted);">Momentum</div>
        <div class="${Math.abs(m) > 80 ? 'momentum-max' : (Math.abs(m) > 75 ? 'momentum-surge' : '')}" style="height: 10px; background: #333; border-radius: 5px; position: relative; overflow: hidden; transition: all 0.3s;">
            <div style="position: absolute; top:0; bottom:0; left: ${pct}%; width: 2px; background: white; z-index: 2;"></div>
            <div style="width: 100%; height: 100%; background: linear-gradient(90deg, var(--danger, #dc3545) 0%, var(--accent, #007bff) 100%); opacity: 0.8;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.7em; color: var(--text-muted);">
            <span>${this.gameState.away.team.abbr}</span>
            <span>${this.gameState.home.team.abbr}</span>
        </div>

        <div style="text-align: center; font-size: 0.7em; margin-top: 5px; color: var(--text-muted); opacity: 0.8;">Drive Heat</div>
        <div style="height: 4px; background: #333; border-radius: 2px; margin-top: 2px; overflow: hidden; width: 60%; margin-left: auto; margin-right: auto;">
            <div style="width: ${this.driveMomentum}%; height: 100%; background: linear-gradient(90deg, #ff9500, #ff3b30); transition: width 0.3s;"></div>
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
        <div class="game-stats-panel">
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
   * Helper to toggle control state
   */
  toggleControls(enable) {
      if (!this.checkUI()) return;
      const parent = this.viewMode ? this.container : this.modal;
      // Target specific control buttons
      const selectors = [
          '#btnPrevPlay', '#btnPlayPause', '#btnNextPlay', '#btnNextDrive', '#btnSkipEnd',
          '.tempo-btn', '.control-btn', '.pause-btn', '.skip-btn'
      ];
      const buttons = parent.querySelectorAll(selectors.join(','));

      buttons.forEach(btn => {
          if (btn.classList.contains('close') || btn.classList.contains('close-game-btn')) return;
          btn.disabled = !enable;
          btn.style.opacity = enable ? '1' : '0.5';
          btn.style.cursor = enable ? 'pointer' : 'not-allowed';
          btn.style.pointerEvents = enable ? 'auto' : 'none';
      });
  }

  /**
   * Skip to next drive
   */
  skipToNextDrive() {
      if (this.isSkipping) return;
      if (this.intervalId) {
          clearTimeout(this.intervalId);
          this.intervalId = null;
      }

      this.isSkipping = true;
      this.isPaused = false;
      this.isPlaying = true;
      this.toggleControls(false);

      const currentPossession = this.gameState.ballPossession;
      let safetyCounter = 0;
      const MAX_SAFETY = 100;

      const processChunk = () => {
          if (!this.gameState || this.isGameEnded) return;

          let playsInChunk = 0;
          const CHUNK_SIZE = 10;

          while (
              this.gameState.ballPossession === currentPossession &&
              !this.gameState.gameComplete &&
              playsInChunk < CHUNK_SIZE &&
              safetyCounter < MAX_SAFETY
          ) {
              playsInChunk++;
              safetyCounter++;

              const state = this.gameState;
              const offense = state.ballPossession === 'home' ? state.home : state.away;
              const defense = state.ballPossession === 'home' ? state.away : state.home;
              const isUserOffense = offense.team.id === this.userTeamId;

              const play = this.generatePlay(offense, defense, state, isUserOffense, null, null);

              this.playByPlay.push(play);
              this.handleEndOfQuarter(state);
          }

          if (this.gameState.ballPossession !== currentPossession || this.gameState.gameComplete || safetyCounter >= MAX_SAFETY) {
              this.isSkipping = false;
              this.isPaused = true;

              if (this.checkUI()) {
                  this.renderGame();
                  const parent = this.viewMode ? this.container : this.modal;
                  if (parent) {
                     const playLog = parent.querySelector(this.viewMode ? '.play-log-enhanced' : '.play-log');
                     if (playLog) {
                         const lastPlay = this.playByPlay[this.playByPlay.length - 1];
                         if (lastPlay) this.renderPlay(lastPlay);
                         playLog.scrollTop = playLog.scrollHeight;
                     }
                  }
              }

              if (this.gameState.gameComplete) {
                  this.endGame();
              } else {
                  this.toggleControls(true);
              }
          } else {
              requestAnimationFrame(processChunk);
          }
      };

      requestAnimationFrame(processChunk);
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
    // Ensure all timers and loops are stopped
    this.stopGame();

    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }

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

    if (this.fieldEffects) {
        this.fieldEffects.destroy();
        this.fieldEffects = null;
    }

    // Clear resize listener if it was attached globally (though FieldEffects handles its own)

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
    if (window.liveGameViewer.initTimeout) clearTimeout(window.liveGameViewer.initTimeout);
    window.liveGameViewer.initTimeout = setTimeout(() => {
        // Double check render if router missed it
        if (location.hash === '#/game-sim') {
            window.liveGameViewer.renderToView('#game-sim');
            window.liveGameViewer.startSim();
        }
        window.liveGameViewer.initTimeout = null;
    }, 50);

  } catch (error) {
    console.error('Error starting live game:', error);
    if (window.setStatus) {
      window.setStatus(`Error starting live game: ${error.message}`, 'error');
    }
  }
};

console.log('✅ Live Game Viewer loaded');
