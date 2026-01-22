// events.js - Core Event Handlers
import { simulateWeek } from './simulation.js';

'use strict';

/**
 * Handles core game events (onboarding, saving, loading, simulating).
 */
let coreEventsBound = false;

const ONBOARDING_IDS = {
    modal: 'onboardModal',
    teamSelect: 'onboardTeam',
    randomButton: 'onboardRandom',
    startButton: 'onboardStart',
    careerOptions: 'careerOptions'
};

function getOnboardingElements() {
    return {
        modal: document.getElementById(ONBOARDING_IDS.modal),
        teamSelect: document.getElementById(ONBOARDING_IDS.teamSelect),
        randomButton: document.getElementById(ONBOARDING_IDS.randomButton),
        startButton: document.getElementById(ONBOARDING_IDS.startButton),
        careerOptions: document.getElementById(ONBOARDING_IDS.careerOptions),
        namesRadios: document.querySelectorAll('input[name="namesMode"]'),
        modeRadios: document.querySelectorAll('input[name="gameMode"]')
    };
}

function toggleCareerOptions(selectedMode) {
    const { careerOptions } = getOnboardingElements();
    if (!careerOptions) return;
    careerOptions.hidden = selectedMode !== 'career';
}

async function ensureTeamsReady(context = 'onboarding') {
    const ready = () => (
        (Array.isArray(window.Teams?.real) && window.Teams.real.length > 0) ||
        (Array.isArray(window.Teams?.fictional) && window.Teams.fictional.length > 0)
    );
    if (ready()) return true;

    if (typeof window.gameController?.ensureTeamsLoaded === 'function') {
        try {
            await window.gameController.ensureTeamsLoaded();
            return ready();
        } catch (error) {
            console.error(`❌ Failed to load teams during ${context}:`, error);
            window.setStatus?.('Unable to load team data. Please refresh.', 'error');
            return false;
        }
    }

    if (typeof window.loadTeamsData === 'function') {
        try {
            await window.loadTeamsData();
        } catch (error) {
            console.error(`❌ Team data loader failed during ${context}:`, error);
            window.setStatus?.('Unable to load team data. Please refresh.', 'error');
            return false;
        }
    }

    return ready();
}

async function refreshTeamDropdown(mode = null) {
    const { teamSelect } = getOnboardingElements();
    if (!teamSelect) return false;

    const teamsReady = await ensureTeamsReady('dropdown');
    if (!teamsReady) {
        teamSelect.innerHTML = '<option disabled selected>Teams unavailable</option>';
        teamSelect.disabled = true;
        return false;
    }

    const previousSelection = teamSelect.value;
    const chosenMode = mode || document.querySelector('input[name="namesMode"]:checked')?.value || 'fictional';
    const teams = (typeof window.listByMode === 'function') ? window.listByMode(chosenMode) : [];

    teamSelect.innerHTML = '';

    if (!teams.length) {
        const option = document.createElement('option');
        option.textContent = 'No teams available';
        option.disabled = true;
        option.selected = true;
        teamSelect.appendChild(option);
        teamSelect.disabled = true;
        window.setStatus?.('No teams available for the selected mode.', 'error');
        return false;
    }

    const fragment = document.createDocumentFragment();
    teams.forEach((team, index) => {
        if (!team?.name || !team?.abbr) return;
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${team.abbr} — ${team.name}`;
        fragment.appendChild(option);
    });

    teamSelect.appendChild(fragment);
    teamSelect.disabled = false;

    // Restore the user's prior selection when possible to avoid changing their choice
    if (previousSelection && teamSelect.querySelector(`option[value="${previousSelection}"]`)) {
        teamSelect.value = previousSelection;
    } else {
        // Default to the first option so the dropdown never ends up empty
        teamSelect.selectedIndex = 0;
    }
    return true;
}

function bindOnboardingControls() {
    const { namesRadios, modeRadios, randomButton, startButton } = getOnboardingElements();

    namesRadios?.forEach(radio => {
        radio.removeEventListener('change', handleNamesModeChange);
        radio.addEventListener('change', handleNamesModeChange);
    });

    modeRadios?.forEach(radio => {
        radio.removeEventListener('change', handleGameModeChange);
        radio.addEventListener('change', handleGameModeChange);
    });

    if (randomButton) {
        randomButton.removeEventListener('click', handleOnboardRandom);
        randomButton.addEventListener('click', handleOnboardRandom);
    }

    if (startButton) {
        startButton.removeEventListener('click', handleOnboardStart);
        startButton.addEventListener('click', handleOnboardStart);
    }
}

async function handleNamesModeChange(e) {
    if (window.state) {
        window.state.namesMode = e.target.value;
    }
    try {
        await refreshTeamDropdown(e.target.value);
    } catch (error) {
        console.error('Failed to refresh teams after mode change:', error);
    }
}

function handleGameModeChange(e) {
    toggleCareerOptions(e.target.value);
}

async function handleOnboardRandom(e) {
    e.preventDefault();
    e.stopPropagation();

    const { teamSelect } = getOnboardingElements();
    if (!teamSelect) return;

    const populated = await refreshTeamDropdown();
    if (!populated) return;

    const options = teamSelect.querySelectorAll('option');
    if (!options.length) return;

    const randomIndex = Math.floor(Math.random() * options.length);
    options[randomIndex].selected = true;
}

function setupEventListeners() {
    if (coreEventsBound) {
        return;
    }
    coreEventsBound = true;

    console.log('Setting up core event listeners...');
    let isSimulating = false; // Flag to prevent double simulation

    document.body.addEventListener('click', function(e) {
        const targetId = e.target.id;

        // Onboarding
        if (targetId === 'onboardStart') {
            handleOnboardStart(e).catch(err => console.error('Failed to start onboarding:', err));
            return;
        }
        if (targetId === 'onboardRandom') {
            handleOnboardRandom(e).catch(err => console.error('Failed to select random team:', err));
            return;
        }

        // Core Actions
        if (targetId === 'btnSave') return saveState();
        if (targetId === 'btnLoad') return handleLoadGame(e);
        if (targetId === 'btnNewLeague') return handleNewLeague(e);
        if (targetId === 'btnRelease') return handleReleasePlayers(e);
        if (targetId === 'btnSimPlayoff') return handleSimulatePlayoff(e);
        
        // **FIXED**: Debounced simulate week handler
        if (targetId === 'btnSimWeek') {
            if (isSimulating) return; // Prevent clicks while a sim is in progress
            isSimulating = true;
            handleSimulateWeek(e.target).finally(() => {
                isSimulating = false; // Re-enable clicks after sim is complete
            });
        }
    });

    // Onboarding radio buttons
    bindOnboardingControls();
}

async function handleOnboardStart(e) {
    e.preventDefault();
    e.stopPropagation();

    const { teamSelect, startButton } = getOnboardingElements();
    const chosenMode = document.querySelector('input[name="namesMode"]:checked')?.value || 'fictional';

    if (startButton) startButton.disabled = true;

    const populated = await refreshTeamDropdown(chosenMode);
    if (!populated) {
        if (startButton) startButton.disabled = false;
        return;
    }

    const teams = (typeof window.listByMode === 'function') ? window.listByMode(chosenMode) : [];
    const teamIdx = teamSelect?.value ?? '0';

    if (!teams.length) {
        window.setStatus?.('No teams available for selected mode. Please reload teams and try again.', 'error');
        console.error('Start Season blocked: no teams available for mode', chosenMode);
        if (startButton) startButton.disabled = false;
        return;
    }

    if (!teams[Number(teamIdx)]) {
        window.setStatus?.('Select a valid team before starting the season.', 'error');
        if (startButton) startButton.disabled = false;
        return;
    }

    try {
        if (window.initNewGame) {
            console.log('🚀 Starting new game with options:', { chosenMode, teamIdx });
            await window.initNewGame({ chosenMode, teamIdx });
            console.log('✅ New game initialization completed');
        } else {
            console.error('❌ initNewGame function not available');
            window.setStatus?.('Game controller unavailable. Please refresh.', 'error');
        }
    } catch (error) {
        console.error('❌ Error starting new game:', error);
        window.setStatus?.(`Failed to start game: ${error.message}`, 'error');
    } finally {
        if (startButton) startButton.disabled = false;
    }
}

async function handleSimulateWeek(button) {
    try {
        const L = window.state?.league;
        const userTeamId = window.state?.userTeamId;
        
        // Check if user's team has a game this week
        let userGame = null;
        if (L && userTeamId !== undefined && L.schedule) {
            const scheduleWeeks = L.schedule.weeks || (Array.isArray(L.schedule) ? L.schedule : []);
            const currentWeek = L.week || 1;
            const weekData = scheduleWeeks.find(w => (w.weekNumber || w.week) === currentWeek) || scheduleWeeks[currentWeek - 1];
            
            if (weekData && weekData.games) {
                userGame = weekData.games.find(g => g && !g.bye && (g.home === userTeamId || g.away === userTeamId));
            }
        }
        
        // Prompt user if they want to watch their game live
        if (userGame && window.watchLiveGame) {
            const homeTeam = L.teams[userGame.home];
            const awayTeam = L.teams[userGame.away];
            const opponent = userGame.home === userTeamId ? awayTeam : homeTeam;
            const isHome = userGame.home === userTeamId;
            
            const watchLive = confirm(
                `Watch your game live?\n\n` +
                `${isHome ? 'Home' : 'Away'}: ${isHome ? homeTeam.name : awayTeam.name}\n` +
                `${!isHome ? 'Home' : 'Away'}: ${!isHome ? homeTeam.name : awayTeam.name}\n\n` +
                `Click OK to watch live (you can call plays!)\n` +
                `Click Cancel to simulate all games instantly.`
            );
            
            if (watchLive) {
                // Watch the game live
                window.watchLiveGame(userGame.home, userGame.away);
                return; // Don't simulate - the live viewer will handle it
            }
        }
        
        // Regular simulation
        if (button) {
            button.disabled = true;
            button.textContent = 'Simulating...';
        }
        await new Promise(resolve => setTimeout(resolve, 50));

        // Use imported simulateWeek
        simulateWeek();

    } catch (error) {
        console.error('Error in handleSimulateWeek:', error);
        window.setStatus(`Error: ${error.message}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Simulate Week';
        }
    }
}

function handleLoadGame() {
    if (confirm('Load saved game? This will overwrite any unsaved progress.')) {
        const loadedState = loadState();
        if (loadedState) {
            window.state = loadedState;
            location.reload();
        } else {
            setStatus('No save file found!');
        }
    }
}

function handleNewLeague() {
    if (confirm('Are you sure you want to start a new league? Your current game will be deleted.')) {
        if (window.gameController?.startNewLeague) {
            window.gameController.startNewLeague();
            return;
        }

        // Fallback for environments where the controller is not available
        if (window.clearSavedState) {
            window.clearSavedState();
        }
        if (window.State?.init) {
            window.state = window.State.init();
        }
        if (window.setActiveSaveSlot && window.state?.saveSlot) {
            window.setActiveSaveSlot(window.state.saveSlot);
        }
        if (window.renderSaveSlotInfo) {
            window.renderSaveSlotInfo();
        }
        window.openOnboard?.();
    }
}

function handleReleasePlayers(e) {
    e.preventDefault();
    
    // Get selected players
    const selectedCheckboxes = document.querySelectorAll('.player-select:checked');
    if (selectedCheckboxes.length === 0) {
        window.setStatus('No players selected for release.');
        return;
    }
    
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (confirm(`Are you sure you want to release ${selectedIds.length} player(s)? This action cannot be undone.`)) {
        if (window.releaseSelected) {
            window.releaseSelected(selectedIds);
        } else {
            window.setStatus('Release functionality not available.');
        }
    }
}

function handleSimulatePlayoff(e) {
    e.preventDefault();
    
    if (window.simPlayoffWeek) {
        window.simPlayoffWeek();
    } else {
        window.setStatus('Playoff simulation not available.');
    }
}

// Add missing openOnboard function
async function openOnboard() {
    console.log('🎯 Opening onboarding modal...');
    const { modal } = getOnboardingElements();
    if (modal) {
        modal.hidden = false;
        modal.style.display = 'flex';

        // Ensure team data is available before populating the dropdown
        const populated = await refreshTeamDropdown();
        if (!populated) return;

        toggleCareerOptions(document.querySelector('input[name="gameMode"]:checked')?.value || 'gm');
        bindOnboardingControls();

        console.log('✅ Onboarding modal opened');
    } else {
        console.error('❌ Onboarding modal not found');
    }
}

window.setupEventListeners = setupEventListeners;
window.openOnboard = openOnboard;

export { setupEventListeners, openOnboard };
