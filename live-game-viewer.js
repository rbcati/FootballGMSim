// live-game-viewer.js - Live game simulation with play-by-play and play calling
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
    this.tempo = 'normal'; // 'hurry-up', 'normal', 'slow'
    this.playCallQueue = null; // User's play call
    this.intervalId = null;
    this.onPlayCallback = null;
    this.onGameEndCallback = null;
    this.modal = null;
    this.hasAppliedResult = false;
  }

  /**
   * Initialize and show live game viewer
   * @param {Object} homeTeam - Home team object
   * @param {Object} awayTeam - Away team object
   * @param {number} userTeamId - ID of user's team (for play calling)
   */
  startGame(homeTeam, awayTeam, userTeamId) {
    if (!homeTeam || !awayTeam) {
      console.error('Invalid teams for live game');
      return;
    }

    this.userTeamId = userTeamId;
    this.gameState = this.initializeGameState(homeTeam, awayTeam);
    this.playByPlay = [];
    this.currentPlayIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.playCallQueue = null;
    this.hasAppliedResult = false;

    this.createModal();
    this.renderGame();
    this.showModal();

    // Start game simulation
    this.simulateGame();
  }

  /**
   * Initialize game state
   */
  initializeGameState(homeTeam, awayTeam) {
    const homeQB = homeTeam.roster?.find(p => p.pos === 'QB');
    const awayQB = awayTeam.roster?.find(p => p.pos === 'QB');

    return {
      home: {
        team: homeTeam,
        score: 0,
        possession: true, // Home team starts with ball
        down: 1,
        distance: 10,
        yardLine: 25, // Start at own 25
        timeouts: 3,
        qb: homeQB
      },
      away: {
        team: awayTeam,
        score: 0,
        possession: false,
        down: 1,
        distance: 10,
        yardLine: 25,
        timeouts: 3,
        qb: awayQB
      },
      quarter: 1,
      time: 900, // 15 minutes in seconds
      ballPossession: 'home', // 'home' or 'away'
      gameComplete: false
    };
  }

  /**
   * Simulate the entire game with play-by-play
   */
  simulateGame() {
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

    // Start displaying plays
    this.startPlayback();
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
      result: null,
      yards: 0,
      message: ''
    };

    // Simulate play result
    const success = Math.random() < successChance;
    let yards = 0;

    // Normalize subtypes
    let baseType = playType;
    if (playType.startsWith('run_')) baseType = 'run';
    if (playType.startsWith('pass_')) baseType = 'pass';

    if (baseType === 'run') {
      let runBonus = 0;
      let variance = 1;

      if (playType === 'run_inside') {
          runBonus = 1; variance = 0.5;
      } else if (playType === 'run_outside') {
          runBonus = -1; variance = 1.5;
      }

      if (success) {
        yards = Math.round(U.rand(2, 8) + runBonus + defModRun);
        if (Math.random() < (0.1 * variance + defModBigPlay)) yards = U.rand(10, 25); // Big play
      } else {
        yards = U.rand(-2, 3);
        // Blitz TFL chance
        if (Math.random() < defModSack * 0.5) yards -= 2;
      }
    } else if (baseType === 'pass') {
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
      } else if (Math.random() < (successChance + completeBonus)) {
        // Completion
        yards = Math.max(1, Math.round(U.rand(5, 15) + yardBonus + defModPass));

        // Big play
        if (Math.random() < (bigPlayChance + defModBigPlay)) {
            yards = U.rand(20, 50);
        }

        // Interception
        if (Math.random() < (intChance + defModInt)) {
          play.result = 'interception';
          yards = 0;
          play.message = `${offense.qb?.name || 'QB'} pass intercepted!`;
        }
      } else {
        yards = 0;
        play.result = 'incomplete';
        play.message = 'Incomplete pass';
      }
    } else if (playType === 'field_goal') {
      const kicker = offense.team.roster?.find(p => p.pos === 'K');
      const kickStrength = kicker?.ovr || 70;
      const distance = 100 - gameState[gameState.ballPossession].yardLine;
      const successChance = Math.max(0.3, Math.min(0.95, 0.9 - (distance - 20) / 30));
      
      if (Math.random() < successChance * (kickStrength / 100)) {
        play.result = 'field_goal';
        play.message = `Field goal is GOOD! (${distance} yards)`;
        offense.score += 3;
        // Switch possession
        this.switchPossession(gameState);
      } else {
        play.result = 'field_goal_miss';
        play.message = `Field goal is NO GOOD (${distance} yards)`;
        this.switchPossession(gameState);
      }
    } else if (playType === 'punt') {
      yards = U.rand(35, 50);
      play.message = `Punt ${yards} yards`;
      this.switchPossession(gameState);
    }

    // Update yard line and down/distance
    if (play.result !== 'interception' && play.result !== 'field_goal' && play.result !== 'field_goal_miss') {
      const newYardLine = gameState[gameState.ballPossession].yardLine + yards;
      
      if (newYardLine >= 100) {
        // Touchdown!
        play.result = 'touchdown';
        play.message = `TOUCHDOWN! ${offense.team.name || offense.team.abbr}`;
        offense.score += 7;
        // Try for extra point (auto-success for now)
        offense.score += 1;
        this.switchPossession(gameState);
      } else if (newYardLine <= 0) {
        // Safety
        play.result = 'safety';
        play.message = 'SAFETY!';
        defense.score += 2;
        this.switchPossession(gameState);
      } else {
        gameState[gameState.ballPossession].yardLine = newYardLine;
        gameState[gameState.ballPossession].distance -= yards;

        if (gameState[gameState.ballPossession].distance <= 0) {
          // First down
          gameState[gameState.ballPossession].down = 1;
          gameState[gameState.ballPossession].distance = 10;
          play.message = `First down! ${yards} yard${yards !== 1 ? 's' : ''} gained`;
        } else {
          gameState[gameState.ballPossession].down++;
          if (gameState[gameState.ballPossession].down > 4) {
            // Turnover on downs
            play.result = 'turnover_downs';
            play.message = 'Turnover on downs';
            this.switchPossession(gameState);
          } else {
            play.message = `${yards >= 0 ? '+' : ''}${yards} yards. ${gameState[gameState.ballPossession].down} & ${gameState[gameState.ballPossession].distance}`;
          }
        }
      }
    }

    play.yards = yards;
    if (!play.message) {
      play.message = playType === 'run' ? 
        `Run for ${yards} yard${yards !== 1 ? 's' : ''}` : 
        `Pass for ${yards} yard${yards !== 1 ? 's' : ''}`;
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
  displayNextPlay() {
    if (this.gameState?.gameComplete) {
      this.endGame();
      return;
    }

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

    const play = this.generatePlay(
      offense,
      defense,
      state,
      isUserOffense,
      this.simulationMeta?.targetHomeScore,
      this.simulationMeta?.targetAwayScore
    );

    this.playByPlay.push(play);
    this.currentPlayIndex = this.playByPlay.length;
    this.renderPlay(play);
    this.updateGameState(play, state);
    this.handleEndOfQuarter(state);

    if (this.gameState.gameComplete) {
      this.endGame();
      return;
    }

    // Auto-advance
    const delay = this.getPlayDelay();
    this.intervalId = setTimeout(() => {
      if (!this.isPaused) {
        this.displayNextPlay();
      }
    }, delay);
  }

  /**
   * Get delay between plays based on tempo
   */
  getPlayDelay() {
    switch (this.tempo) {
      case 'hurry-up': return 800; // 0.8 seconds
      case 'slow': return 3000; // 3 seconds
      default: return 1500; // 1.5 seconds
    }
  }

  /**
   * Render a play to the UI
   */
  renderPlay(play) {
    const playLog = this.modal.querySelector('.play-log');
    if (!playLog) return;

    const playElement = document.createElement('div');
    playElement.className = 'play-item';

    if (play.type === 'play') {
      const offense = this.gameState[this.gameState.ballPossession === 'home' ? 'home' : 'away'];
      const offenseTeam = offense.team;
      playElement.innerHTML = `
        <div class="play-info">
          <span class="play-time">Q${play.quarter} ${this.formatTime(play.time)}</span>
          <span class="play-down">${play.down} & ${play.distance}</span>
          <span class="play-yardline">${play.yardLine} yard line</span>
        </div>
        <div class="play-result">
          <span class="play-type">${play.playType.toUpperCase()}</span>
          <span class="play-message">${play.message}</span>
        </div>
      `;
    } else if (play.type === 'quarter_end') {
      playElement.className = 'play-item quarter-break';
      playElement.innerHTML = `<div class="play-message">${play.message}</div>`;
    } else if (play.type === 'game_end') {
      playElement.className = 'play-item game-end';
      playElement.innerHTML = `
        <div class="play-message">${play.message}</div>
        <div class="final-score">
          Final: ${this.gameState.away.team.name || this.gameState.away.team.abbr} ${play.finalScore.away} - 
          ${this.gameState.home.team.name || this.gameState.home.team.abbr} ${play.finalScore.home}
        </div>
      `;
    }

    playLog.appendChild(playElement);
    playLog.scrollTop = playLog.scrollHeight;

    // Update scoreboard
    this.updateScoreboard();
  }

  /**
   * Update scoreboard display
   */
  updateScoreboard() {
    const scoreboard = this.modal.querySelector('.scoreboard');
    if (!scoreboard || !this.gameState) return;

    const home = this.gameState.home;
    const away = this.gameState.away;
    const state = this.gameState;

    scoreboard.innerHTML = `
      <div class="score-team ${state.ballPossession === 'away' ? 'has-possession' : ''}">
        <div class="team-name">${away.team.name || away.team.abbr}</div>
        <div class="team-score">${away.score}</div>
      </div>
      <div class="score-info">
        <div class="game-clock">Q${state.quarter} ${this.formatTime(state.time)}</div>
        <div class="down-distance">
          ${state[state.ballPossession].down} & ${state[state.ballPossession].distance} at ${state[state.ballPossession].yardLine}
        </div>
      </div>
      <div class="score-team ${state.ballPossession === 'home' ? 'has-possession' : ''}">
        <div class="team-name">${home.team.name || home.team.abbr}</div>
        <div class="team-score">${home.score}</div>
      </div>
    `;
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
    const playCalling = this.modal.querySelector('.play-calling');
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
        playCalling.querySelector('.play-call-prompt').textContent = 'Call Offense:';
    } else {
        offRows.forEach(r => r.style.display = 'none');
        if (defRow) defRow.style.display = 'flex';
        playCalling.querySelector('.play-call-prompt').textContent = 'Call Defense:';
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
    const playCalling = this.modal.querySelector('.play-calling');
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
   * Set game tempo
   */
  setTempo(tempo) {
    this.tempo = tempo;
    const tempoBtn = this.modal.querySelector(`.tempo-btn[data-tempo="${tempo}"]`);
    if (tempoBtn) {
      this.modal.querySelectorAll('.tempo-btn').forEach(btn => btn.classList.remove('active'));
      tempoBtn.classList.add('active');
    }
  }

  /**
   * Pause/Resume game
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    const pauseBtn = this.modal.querySelector('.pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = this.isPaused ? '▶ Resume' : '⏸ Pause';
    }

    if (!this.isPaused && this.isPlaying) {
      this.displayNextPlay();
    }
  }

  /**
   * End game
   */
  endGame() {
    this.isPlaying = false;
    this.isPaused = true;

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    // Show final stats
    const finalStats = this.modal.querySelector('.final-stats');
    if (finalStats) {
      finalStats.style.display = 'block';
    }

    if (this.onGameEndCallback) {
      this.onGameEndCallback(this.gameState);
    }

    this.applyLiveResultToLeague();
  }

  /**
   * Apply live game result to league simulation
   */
  applyLiveResultToLeague() {
    if (this.hasAppliedResult) return;

    const L = window.state?.league;
    if (!L || !L.schedule) return;

    const scheduleWeeks = L.schedule.weeks || L.schedule;
    if (!Array.isArray(scheduleWeeks)) return;

    const weekIndex = (L.week || 1) - 1;
    const weekData = scheduleWeeks[weekIndex];
    if (!weekData?.games) return;

    if (L.resultsByWeek?.[weekIndex]?.length) return;

    const homeId = this.gameState?.home?.team?.id;
    const awayId = this.gameState?.away?.team?.id;
    if (homeId === undefined || awayId === undefined) return;

    const matchingGame = weekData.games.find(game => game && !game.bye && game.home === homeId && game.away === awayId);
    if (!matchingGame) return;

    if (typeof window.simulateWeek === 'function') {
      this.hasAppliedResult = true;
      window.simulateWeek({
        overrideResults: [{
          home: homeId,
          away: awayId,
          scoreHome: this.gameState.home.score,
          scoreAway: this.gameState.away.score
        }]
      });
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
          <button class="close" aria-label="Close">&times;</button>
        </div>
        
        <div class="scoreboard"></div>
        
        <div class="game-controls">
          <button class="tempo-btn active" data-tempo="normal">Normal</button>
          <button class="tempo-btn" data-tempo="hurry-up">Hurry-Up</button>
          <button class="tempo-btn" data-tempo="slow">Slow</button>
          <button class="pause-btn">⏸ Pause</button>
        </div>

        <div class="play-calling" style="display: none;">
          <div class="play-call-prompt">Call Your Play:</div>
          <div class="play-call-buttons" style="flex-direction: column; gap: 8px;">
            <div class="play-row">
                <span style="font-size: 10px; color: #888;">RUN</span>
                <button class="play-call-btn" data-play="run_inside">Inside</button>
                <button class="play-call-btn" data-play="run_outside">Outside</button>
            </div>
            <div class="play-row">
                <span style="font-size: 10px; color: #888;">PASS</span>
                <button class="play-call-btn" data-play="pass_short">Short</button>
                <button class="play-call-btn" data-play="pass_medium">Med</button>
                <button class="play-call-btn" data-play="pass_long">Long</button>
            </div>
            <div class="play-row">
                <span style="font-size: 10px; color: #888;">ST</span>
                <button class="play-call-btn" data-play="field_goal">FG</button>
                <button class="play-call-btn" data-play="punt">Punt</button>
            </div>
            <div class="play-row defense-row" style="border-top: 1px solid #333; padding-top: 8px;">
                <span style="font-size: 10px; color: #888;">DEF</span>
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

    // Event listeners
    modal.querySelector('.close').addEventListener('click', () => this.hideModal());
    modal.querySelectorAll('.tempo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setTempo(e.target.dataset.tempo);
      });
    });
    modal.querySelector('.pause-btn').addEventListener('click', () => this.togglePause());
    modal.querySelectorAll('.play-call-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.callPlay(e.target.dataset.play);
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
   * Render game UI
   */
  renderGame() {
    this.updateScoreboard();
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
    this.hideModal();
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
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

    if (!homeTeam || !awayTeam) {
      console.error('Teams not found for IDs:', homeId, awayId);
      window.setStatus('Could not find teams for live game.', 'error');
      return;
    }

    // Check if this is a user's team game for play calling
    const isUserGame = homeId === userTeamId || awayId === userTeamId;
    
    window.setStatus(`Starting live game: ${awayTeam.name} @ ${homeTeam.name}${isUserGame ? ' (You can call plays!)' : ''}`, 'success');
    window.liveGameViewer.startGame(homeTeam, awayTeam, userTeamId);
  } catch (error) {
    console.error('Error starting live game:', error);
    if (window.setStatus) {
      window.setStatus(`Error starting live game: ${error.message}`, 'error');
    }
  }
};

console.log('✅ Live Game Viewer loaded');
