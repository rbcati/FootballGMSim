// debug-helper.js - Add this to help troubleshoot issues
(function() {
  'use strict';
  
  console.log('🔍 NFL GM Debug Helper loaded');
  
  // Debug functions
  window.debugNFLGM = {
    
    checkDependencies() {
      console.log('📋 Checking dependencies...');
      
      const required = {
        'Constants': window.Constants,
        'Teams': window.Teams,
        'Utils': window.Utils,
        'state': window.state,
        'makeLeague': window.makeLeague,
        'listByMode': window.listByMode,
        'openOnboard': window.openOnboard,
        'show': window.show,
        'setStatus': window.setStatus
      };
      
      const missing = [];
      const available = [];
      
      Object.keys(required).forEach(key => {
        if (required[key]) {
          available.push(key);
        } else {
          missing.push(key);
        }
      });
      
      console.log('✅ Available:', available);
      console.log('❌ Missing:', missing);
      
      return missing.length === 0;
    },
    
    checkModal() {
      console.log('🎭 Checking modal...');
      
      const modal = document.getElementById('onboardModal');
      const teamSelect = document.getElementById('onboardTeam');
      const startButton = document.getElementById('onboardStart');
      
      console.log('Modal element:', modal);
      console.log('Modal hidden:', modal?.hidden);
      console.log('Modal display style:', modal?.style?.display);
      console.log('Team select:', teamSelect);
      console.log('Team select options:', teamSelect?.options?.length);
      console.log('Start button:', startButton);
      
      if (modal && modal.hidden) {
        console.log('🔧 Attempting to show modal...');
        modal.hidden = false;
        modal.style.display = 'flex';
      }
    },
    
    forceShowModal() {
      console.log('🚀 Force showing modal...');
      if (window.openOnboard) {
        window.openOnboard();
      } else {
        console.error('openOnboard function not available');
      }
    },
    
    checkTeams() {
      console.log('🏈 Checking teams...');
      
      if (window.listByMode) {
        const fictional = window.listByMode('fictional');
        const real = window.listByMode('real');
        
        console.log('Fictional teams:', fictional.length);
        console.log('Real teams:', real.length);
        console.log('Sample fictional:', fictional[0]);
        console.log('Sample real:', real[0]);
      } else {
        console.error('listByMode function not available');
      }
    },
    
    simulateStart() {
      console.log('🎮 Simulating game start...');
      
      // Set up basic state
      if (!window.state) {
        window.state = {};
      }
      
      window.state.namesMode = 'fictional';
      window.state.userTeamId = 0;
      window.state.gameMode = 'gm';
      window.state.playerRole = 'GM';
      window.state.onboarded = false;
      
      // Try to create a league
      if (window.makeLeague && window.listByMode) {
        try {
          const teams = window.listByMode('fictional');
          console.log('Creating league with', teams.length, 'teams');
          const league = window.makeLeague(teams);
          window.state.league = league;
          window.state.onboarded = true;
          
          console.log('League created successfully:', league);
          
          // Try to show hub
          if (window.show) {
            window.show('hub');
          }
          
          if (window.refreshAll) {
            window.refreshAll();
          }
          
        } catch (error) {
          console.error('Error creating league:', error);
        }
      }
    },
    
    fullDiagnostic() {
      console.log('🔍 Running full diagnostic...');
      console.log('==========================================');
      
      this.checkDependencies();
      console.log('');
      this.checkModal();
      console.log('');
      this.checkTeams();
      console.log('');
      
      console.log('📊 State:', window.state);
      console.log('📊 Constants:', window.Constants ? 'loaded' : 'missing');
      console.log('📊 Teams data:', window.Teams ? 'loaded' : 'missing');
      
      console.log('==========================================');
      console.log('💡 To fix issues, try:');
      console.log('1. debugNFLGM.forceShowModal() - Force show the modal');
      console.log('2. debugNFLGM.simulateStart() - Skip modal and start game');
      console.log('3. Check browser console for errors');
      console.log('4. Make sure all JS files are loaded in correct order');
    },
    
    resetGame() {
      console.log('🔄 Resetting game...');
      const saveKey = window.Constants?.GAME_CONFIG?.SAVE_KEY || 'nflGM4.league';
      localStorage.removeItem(saveKey);
      location.reload();
    }
  };
  
  // Auto-run diagnostic in development
  setTimeout(() => {
    console.log('🚀 Auto-running diagnostic...');
    window.debugNFLGM.fullDiagnostic();
  }, 1000);
  
})();

// CSS to ensure modal is visible (add to your CSS file)
const debugCSS = `
.modal {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  background: rgba(0, 0, 0, 0.8) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 9999 !important;
}

.modal[hidden] {
  display: none !important;
}

.modal-card {
  background: #1a1a1a !important;
  padding: 2rem !important;
  border-radius: 8px !important;
  max-width: 500px !important;
  width: 90% !important;
  color: white !important;
}

.modal-card h3 {
  margin-bottom: 1rem !important;
  color: white !important;
}

.modal-card .section {
  margin-bottom: 1rem !important;
}

.modal-card label {
  display: block !important;
  margin-bottom: 0.5rem !important;
  color: white !important;
}

.modal-card input[type="radio"] {
  margin-right: 0.5rem !important;
}

.modal-card select {
  width: 100% !important;
  padding: 0.5rem !important;
  margin-bottom: 0.5rem !important;
}

.modal-card button {
  padding: 0.5rem 1rem !important;
  margin: 0.25rem !important;
  cursor: pointer !important;
}

.row {
  display: flex !important;
  gap: 0.5rem !important;
  align-items: center !important;
}
`;
// Add this to debug-helper.js

window.debugNFLGM = {
  ...window.debugNFLGM, // Keep existing debug functions
  
  // New simulation debugging function
  checkSimulation() {
    console.log('🏈 Checking simulation setup...');
    console.log('==========================================');
    
    const L = state.league;
    if (!L) {
      console.error('❌ No league found');
      return false;
    }
    
    console.log('✅ League found:', L.year, 'Week', L.week);
    
    // Check schedule
    if (!L.schedule) {
      console.error('❌ No schedule found');
      return false;
    }
    
    const scheduleWeeks = L.schedule.weeks || L.schedule;
    if (!Array.isArray(scheduleWeeks)) {
      console.error('❌ Schedule is not an array:', typeof scheduleWeeks);
      return false;
    }
    
    console.log('✅ Schedule found:', scheduleWeeks.length, 'weeks');
    
    // Check current week
    const currentWeekIndex = L.week - 1;
    if (currentWeekIndex >= scheduleWeeks.length) {
      console.log('⚠️ Current week beyond schedule (season over?)');
      return false;
    }
    
    const currentWeek = scheduleWeeks[currentWeekIndex];
    if (!currentWeek || !currentWeek.games) {
      console.error('❌ Current week has no games:', currentWeek);
      return false;
    }
    
    console.log('✅ Current week games:', currentWeek.games.length);
    
    // Check teams
    if (!L.teams || !Array.isArray(L.teams)) {
      console.error('❌ No teams array found');
      return false;
    }
    
    console.log('✅ Teams found:', L.teams.length);
    
    // Check first few games
    console.log('📋 Sample games for current week:');
    currentWeek.games.slice(0, 3).forEach((game, i) => {
      if (game.bye !== undefined) {
        console.log(`  Game ${i + 1}: Team ${game.bye} has BYE`);
      } else {
        const home = L.teams[game.home];
        const away = L.teams[game.away];
        if (home && away) {
          console.log(`  Game ${i + 1}: ${away.name} @ ${home.name}`);
        } else {
          console.error(`  Game ${i + 1}: Invalid teams - home: ${game.home}, away: ${game.away}`);
        }
      }
    });
    
    // Check simulation functions
    const requiredFunctions = ['simGameStats', 'applyResult', 'simulateWeek'];
    const missingFunctions = requiredFunctions.filter(fn => !window[fn]);
    
    if (missingFunctions.length > 0) {
      console.error('❌ Missing simulation functions:', missingFunctions);
      return false;
    }
    
    console.log('✅ All simulation functions available');
    
    // Test game simulation (dry run)
    try {
      const testGame = currentWeek.games.find(g => g.bye === undefined);
      if (testGame) {
        const home = L.teams[testGame.home];
        const away = L.teams[testGame.away];
        if (home && away) {
          console.log('🧪 Testing game simulation...');
          const result = window.simGameStats(home, away);
          console.log('✅ Test simulation result:', result);
        }
      }
    } catch (error) {
      console.error('❌ Simulation test failed:', error);
      return false;
    }
    
    console.log('==========================================');
    console.log('✅ Simulation setup looks good!');
    console.log('💡 Try running: debugNFLGM.forceSimulate()');
    
    return true;
  },
  
  // Force simulate current week with detailed logging
  forceSimulate() {
    console.log('🚀 Force simulating week...');
    
    if (!this.checkSimulation()) {
      console.error('❌ Simulation check failed');
      return;
    }
    
    try {
      window.simulateWeek();
      console.log('✅ Simulation completed');
    } catch (error) {
      console.error('❌ Simulation failed:', error);
    }
  },
  
  // Check current league state
  checkLeagueState() {
    console.log('📊 League State:');
    const L = state.league;
    if (!L) {
      console.log('❌ No league');
      return;
    }
    
    console.log('Year:', L.year);
    console.log('Week:', L.week);
    console.log('Teams:', L.teams?.length || 0);
    console.log('Schedule weeks:', L.schedule?.weeks?.length || L.schedule?.length || 0);
    console.log('Results stored:', Object.keys(L.resultsByWeek || {}).length, 'weeks');
    
    // Show team records
    console.log('📋 Team Records (top 5):');
    if (L.teams) {
      const sortedTeams = [...L.teams].sort((a, b) => b.record.w - a.record.w);
      sortedTeams.slice(0, 5).forEach((team, i) => {
        console.log(`  ${i + 1}. ${team.name}: ${team.record.w}-${team.record.l}-${team.record.t}`);
      });
    }
  }
};
// Inject debug CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = debugCSS;
document.head.appendChild(styleSheet);

// Add this to your debug-helper.js file or run in console

// Debug team selection issues
window.debugNFLGM.testTeamSelection = function() {
  console.log('🏈 Testing Team Selection...');
  console.log('==========================================');
  
  // Test 1: Check if Teams data exists
  if (!window.Teams) {
    console.error('❌ Teams object not found');
    return false;
  }
  
  console.log('✅ Teams object found');
  console.log('Teams.TEAM_META_REAL:', window.Teams.TEAM_META_REAL ? window.Teams.TEAM_META_REAL.length : 'missing');
  console.log('Teams.TEAM_META_FICTIONAL:', window.Teams.TEAM_META_FICTIONAL ? window.Teams.TEAM_META_FICTIONAL.length : 'missing');
  
  // Test 2: Check listByMode function
  if (!window.listByMode) {
    console.error('❌ listByMode function not found');
    return false;
  }
  
  console.log('✅ listByMode function found');
  
  // Test fictional teams
  const fictional = window.listByMode('fictional');
  console.log('📋 Fictional teams:', fictional.length);
  if (fictional.length > 0) {
    console.log('Sample fictional:', fictional.slice(0, 3).map(t => `${t.abbr} - ${t.name}`));
  }
  
  // Test real teams
  const real = window.listByMode('real');
  console.log('📋 Real teams:', real.length);
  if (real.length > 0) {
    console.log('Sample real:', real.slice(0, 3).map(t => `${t.abbr} - ${t.name}`));
  }
  
  // Test 3: Check modal elements
  const modal = document.getElementById('onboardModal');
  const teamSelect = document.getElementById('onboardTeam');
  const fictionalRadio = document.querySelector('input[name="namesMode"][value="fictional"]');
  const realRadio = document.querySelector('input[name="namesMode"][value="real"]');
  
  console.log('🎭 Modal elements:');
  console.log('Modal found:', !!modal);
  console.log('Team select found:', !!teamSelect);
  console.log('Fictional radio found:', !!fictionalRadio);
  console.log('Real radio found:', !!realRadio);
  
  // Test 4: Test team dropdown population
  if (teamSelect && fictional.length > 0) {
    console.log('🧪 Testing team dropdown population...');
    
    teamSelect.innerHTML = '';
    fictional.forEach((team, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${team.abbr} — ${team.name}`;
      teamSelect.appendChild(option);
    });
    
    console.log('✅ Team dropdown populated with', teamSelect.options.length, 'options');
  }
  
  // Test 5: Check functions
  const functions = [
    'openOnboard',
    'populateTeamDropdown', 
    'handleGameStart',
    'setupOnboardEventListeners'
  ];
  
  console.log('🔧 Function availability:');
  functions.forEach(fn => {
    console.log(`${window[fn] ? '✅' : '❌'} ${fn}`);
  });
  
  console.log('==========================================');
  console.log('💡 To test manually:');
  console.log('1. window.openOnboard() - Open the modal');
  console.log('2. Change radio buttons and see if teams update');
  console.log('3. window.testTeamSelection() - Run this test again');
  
  return fictional.length > 0 && real.length > 0;
};

// Quick fix function
window.debugNFLGM.quickFixTeamSelection = function() {
  console.log('🔧 Quick fixing team selection...');
  
  const teamSelect = document.getElementById('onboardTeam');
  if (!teamSelect) {
    console.error('Team select not found');
    return;
  }
  
  // Force populate with fictional teams
  const fictional = window.listByMode('fictional');
  if (fictional.length === 0) {
    console.error('No fictional teams found');
    return;
  }
  
  teamSelect.innerHTML = '';
  fictional.forEach((team, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${team.abbr} — ${team.name}`;
    teamSelect.appendChild(option);
  });
  
  console.log('✅ Quick fix applied -', teamSelect.options.length, 'teams added');
  
  // Also set up the radio button events
  const radios = document.querySelectorAll('input[name="namesMode"]');
  radios.forEach(radio => {
    radio.addEventListener('change', function() {
      console.log('Mode changed to:', this.value);
      const teams = window.listByMode(this.value);
      teamSelect.innerHTML = '';
      teams.forEach((team, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${team.abbr} — ${team.name}`;
        teamSelect.appendChild(option);
      });
    });
  });
  
  console.log('✅ Event listeners added');
};

// Add comprehensive team loading test
window.testTeamLoading = function() {
    console.log('🧪 === COMPREHENSIVE TEAM LOADING TEST ===');
    
    // Test 1: Check if basic objects exist
    console.log('1️⃣ Basic objects check:');
    console.log('window.Teams:', !!window.Teams);
    console.log('window.Constants:', !!window.Constants);
    console.log('window.listByMode:', !!window.listByMode);
    console.log('window.populateTeamDropdown:', !!window.populateTeamDropdown);
    
    // Test 2: Check team data
    console.log('2️⃣ Team data check:');
    if (window.Teams) {
        console.log('Teams.real:', window.Teams.real?.length || 'missing');
        console.log('Teams.fictional:', window.Teams.fictional?.length || 'missing');
        console.log('Teams.TEAM_META_REAL:', window.Teams.TEAM_META_REAL?.length || 'missing');
        console.log('Teams.TEAM_META_FICTIONAL:', window.Teams.TEAM_META_FICTIONAL?.length || 'missing');
    }
    
    if (window.Constants) {
        console.log('Constants.TEAMS_REAL:', window.Constants.TEAMS_REAL?.length || 'missing');
        console.log('Constants.TEAMS_FICTIONAL:', window.Constants.TEAMS_FICTIONAL?.length || 'missing');
    }
    
    // Test 3: Test listByMode function
    console.log('3️⃣ listByMode function test:');
    if (window.listByMode) {
        try {
            const fictional = window.listByMode('fictional');
            const real = window.listByMode('real');
            console.log('Fictional teams returned:', fictional.length);
            console.log('Real teams returned:', real.length);
            
            if (fictional.length > 0) {
                console.log('Sample fictional team:', fictional[0]);
            }
            if (real.length > 0) {
                console.log('Sample real team:', real[0]);
            }
        } catch (error) {
            console.error('Error calling listByMode:', error);
        }
    }
    
    // Test 4: Test populateTeamDropdown function
    console.log('4️⃣ populateTeamDropdown function test:');
    if (window.populateTeamDropdown) {
        try {
            const teamSelect = document.getElementById('onboardTeam');
            if (teamSelect) {
                console.log('Team select element found, testing population...');
                const result = window.populateTeamDropdown('fictional');
                console.log('Population result:', result);
                console.log('Options in dropdown:', teamSelect.options.length);
            } else {
                console.log('Team select element not found');
            }
        } catch (error) {
            console.error('Error calling populateTeamDropdown:', error);
        }
    }
    
    // Test 5: Check onboarding modal
    console.log('5️⃣ Onboarding modal check:');
    const modal = document.getElementById('onboardModal');
    const teamSelect = document.getElementById('onboardTeam');
    console.log('Modal element:', !!modal);
    console.log('Team select element:', !!teamSelect);
    
    if (modal) {
        console.log('Modal display:', modal.style.display);
        console.log('Modal hidden:', modal.hidden);
    }
    
    if (teamSelect) {
        console.log('Team select options:', teamSelect.options.length);
        console.log('Team select value:', teamSelect.value);
        console.log('Team select selectedIndex:', teamSelect.selectedIndex);
    }
    
    // Test 6: Check game state
    console.log('6️⃣ Game state check:');
    console.log('window.state:', !!window.state);
    if (window.state) {
        console.log('State onboarded:', window.state.onboarded);
        console.log('State namesMode:', window.state.namesMode);
        console.log('State userTeamId:', window.state.userTeamId);
        console.log('State league:', !!window.state.league);
        if (window.state.league) {
            console.log('League teams:', window.state.league.teams?.length || 'missing');
        }
    }
    
    console.log('🧪 === END TEAM LOADING TEST ===');
};

// Add player stats debug function
window.debugPlayerStatsSystem = function() {
    console.log('🔍 === PLAYER STATS SYSTEM DEBUG ===');
    
    // Check if player stats viewer is initialized
    console.log('1️⃣ PlayerStatsViewer check:');
    console.log('window.playerStatsViewer:', !!window.playerStatsViewer);
    if (window.playerStatsViewer) {
        console.log('Initialized:', window.playerStatsViewer.initialized);
        console.log('Modal:', !!window.playerStatsViewer.modal);
        console.log('Current player:', window.playerStatsViewer.currentPlayer);
    }
    
    // Check if team ratings functions are available
    console.log('2️⃣ Team ratings functions check:');
    console.log('calculateOffensiveRating:', !!window.calculateOffensiveRating);
    console.log('calculateDefensiveRating:', !!window.calculateDefensiveRating);
    console.log('calculateTeamRating:', !!window.calculateTeamRating);
    
    // Check if player stats modal exists in DOM
    console.log('3️⃣ DOM elements check:');
    const modal = document.getElementById('playerStatsModal');
    console.log('playerStatsModal element:', !!modal);
    if (modal) {
        console.log('Modal display:', modal.style.display);
        console.log('Modal classes:', modal.className);
    }
    
    // Check if any players are clickable
    console.log('4️⃣ Player clickability check:');
    const playerRows = document.querySelectorAll('.player-row, tr[data-player-id]');
    console.log('Player rows found:', playerRows.length);
    if (playerRows.length > 0) {
        console.log('Sample player row:', playerRows[0]);
        console.log('Has clickable class:', playerRows[0].classList.contains('clickable'));
        console.log('Has player ID:', !!playerRows[0].dataset.playerId);
    }
    
    // Check game state
    console.log('5️⃣ Game state check:');
    console.log('window.state:', !!window.state);
    if (window.state) {
        console.log('League:', !!window.state.league);
        console.log('Teams:', window.state.league?.teams?.length || 'missing');
        if (window.state.league?.teams) {
            const firstTeam = window.state.league.teams[0];
            console.log('First team:', firstTeam?.name);
            console.log('First team roster:', firstTeam?.roster?.length || 'missing');
            if (firstTeam?.roster?.length > 0) {
                const firstPlayer = firstTeam.roster[0];
                console.log('First player:', firstPlayer?.name);
                console.log('First player stats:', !!firstPlayer?.stats);
                console.log('First player ratings:', !!firstPlayer?.ratings);
            }
        }
    }
    
    console.log('🔍 === END PLAYER STATS DEBUG ===');
};
