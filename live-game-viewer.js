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
    this.container = null;
    this.viewMode = false;
    this.hasAppliedResult = false;
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
    container.innerHTML = `
      <div class="card">
        <div class="scoreboard"></div>
        <div class="control-bar">
            <button class="control-btn" id="btnPrevPlay">⏮ Prev</button>
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
        <div class="card" style="height: 600px; display: flex; flex-direction: column;">
            <h3>Play-by-Play</h3>
            <div class="play-log-enhanced"></div>
        </div>
        <div>
            <div class="card">
                <h3>Game Stats</h3>
                <div class="game-dashboard" style="margin-bottom: 15px;">
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
        // Render all past plays
        this.playByPlay.forEach(play => {
            this.renderPlay(play);
        });

        // Scroll to bottom
        const playLog = container.querySelector('.play-log-enhanced');
        if (playLog) {
            playLog.scrollTop = playLog.scrollHeight;
        }
    }

    this.renderGame();
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
    this.isPaused = false; // Start paused for better UX? No, auto-play.
    this.playCallQueue = null;
    this.hasAppliedResult = false;

    // Start game simulation
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

        this.switchPossession(gameState);
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

        this.switchPossession(gameState);
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
    const parent = this.viewMode ? this.container : this.modal;
    if (!parent) return;

    // Determine target log - view mode uses 'play-log-enhanced', modal uses 'play-log'
    const playLog = parent.querySelector(this.viewMode ? '.play-log-enhanced' : '.play-log');
    if (!playLog) return;

    const playElement = document.createElement('div');
    playElement.className = 'play-item';

    // Add specific classes based on result
    if (play.result === 'touchdown') playElement.classList.add('play-touchdown');
    else if (play.result === 'turnover' || play.result === 'turnover_downs') playElement.classList.add('play-turnover');
    else if (play.result === 'sack') playElement.classList.add('play-sack');
    else if (play.result === 'big_play') playElement.classList.add('play-big-play');

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
   * Update scoreboard display
   */
  updateScoreboard() {
    const parent = this.viewMode ? this.container : this.modal;
    if (!parent) return;

    const scoreboard = parent.querySelector('.scoreboard');
    if (!scoreboard || !this.gameState) return;

    const home = this.gameState.home;
    const away = this.gameState.away;
    const state = this.gameState;

    scoreboard.innerHTML = `
      <div class="score-team ${state.ballPossession === 'away' ? 'has-possession' : ''}">
        <div class="team-name">${away.team.abbr}</div>
        <div class="team-score">${away.score}</div>
      </div>
      <div class="score-info">
        <div class="game-clock">Q${state.quarter} ${this.formatTime(state.time)}</div>
        <div class="down-distance">
          ${state[state.ballPossession].down} & ${state[state.ballPossession].distance} at ${state[state.ballPossession].yardLine}
        </div>
      </div>
      <div class="score-team ${state.ballPossession === 'home' ? 'has-possession' : ''}">
        <div class="team-name">${home.team.abbr}</div>
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
    const parent = this.viewMode ? this.container : this.modal;
    if (!parent) return;

    // Check if we need to inject the buttons for view mode
    if (this.viewMode) {
        const pcContainer = parent.querySelector('.play-calling');
        if (pcContainer && pcContainer.innerHTML.trim() === '') {
            pcContainer.innerHTML = `
                <div class="play-call-prompt" style="margin-bottom: 10px; font-weight: bold; color: var(--accent);">Call Your Play:</div>
                <div class="play-call-buttons" style="display: flex; gap: 10px; flex-wrap: wrap;">
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
                    this.callPlay(e.target.dataset.play);
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
    const parent = this.viewMode ? this.container : this.modal;
    if (!parent) return;

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
   */
  skipToEnd() {
      if (this.intervalId) clearTimeout(this.intervalId);
      this.isPaused = false;
      this.isPlaying = true;
      this.isSkipping = true;

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
          this.renderPlay(play);
          this.updateGameState(play, state);
          this.handleEndOfQuarter(state);
      }

      this.isSkipping = false;
      this.renderGame();
      this.endGame();

      // Scroll log to bottom
      const playLog = this.modal.querySelector('.play-log');
      if (playLog) playLog.scrollTop = playLog.scrollHeight;
  }

  /**
   * Set game tempo
   */
  setTempo(tempo) {
    this.tempo = tempo;
    const parent = this.viewMode ? this.container : this.modal;
    if (!parent) return;

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
    const parent = this.viewMode ? this.container : this.modal;
    if (!parent) return;

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
          <button type="button" class="close" aria-label="Close modal">&times;</button>
        </div>
        
        <div class="scoreboard"></div>
        
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
    modal.querySelector('.skip-btn').addEventListener('click', () => this.skipToEnd());
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
    this.renderBoxScore();
    this.renderMomentum();
    this.renderGameStats();
  }

  /**
   * Render Box Score
   */
  renderBoxScore() {
      const parent = this.viewMode ? this.container : this.modal;
      if (!parent) return;

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
      const parent = this.viewMode ? this.container : this.modal;
      if (!parent) return;

      const container = parent.querySelector('.momentum-panel');
      if (!container) return;

      const m = this.gameState.momentum;
      const pct = (m + 100) / 2;

      container.innerHTML = `
        <div style="text-align: center; font-size: 0.8em; margin-bottom: 4px; color: var(--text-muted);">Momentum</div>
        <div style="height: 10px; background: #333; border-radius: 5px; position: relative; overflow: hidden;">
            <div style="position: absolute; top:0; bottom:0; left: ${pct}%; width: 2px; background: white; z-index: 2;"></div>
            <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #dc3545 0%, #007bff 100%); opacity: 0.8;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.7em; color: var(--text-muted);">
            <span>${this.gameState.away.team.abbr}</span>
            <span>${this.gameState.home.team.abbr}</span>
        </div>
      `;
  }

  /**
   * Render Game Stats
   */
  renderGameStats() {
      const parent = this.viewMode ? this.container : this.modal;
      if (!parent) return;

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
          this.renderPlay(play);
          this.updateGameState(play, state);
          this.handleEndOfQuarter(state);
      }

      this.isSkipping = false;
      this.isPaused = true; // Pause after drive
      this.renderGame();
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
    if (this.container) {
        this.container.innerHTML = '';
        this.container = null;
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

    // Start game but instead of showing modal, route to view
    window.liveGameViewer.startGame(homeTeam, awayTeam, userTeamId);

    // If not in view mode yet, route there
    location.hash = '#/game-sim';

  } catch (error) {
    console.error('Error starting live game:', error);
    if (window.setStatus) {
      window.setStatus(`Error starting live game: ${error.message}`, 'error');
    }
  }
};

console.log('✅ Live Game Viewer loaded');
