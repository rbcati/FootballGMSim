// offseason.js - Offseason Management System
'use strict';

// Ensure we don't overwrite if loaded twice
if (!window.runOffseason) {

    /**
     * Main Offseason Workflow Controller
     * Called by simulation.js when season ends
     */
    window.runOffseason = function() {
        console.log("🏁 Running Offseason Workflow...");

        const league = window.state.league;
        const userTeam = league.teams[window.state.userTeamId];

        // 1. Coaching Changes (Automated for CPU)
        if (window.processStaffPoaching) {
            console.log("Processing coaching changes...");
            // processStaffPoaching is already called in simulation.js, but any extra logic can go here
        }

        // 2. Mock Draft Generation (if not already done)
        // simulation.js calls generateDraftClass

        // 3. User Notifications
        if (window.setStatus) {
            window.setStatus("Offseason: Prepare for the Draft & Free Agency!", "info");
        }

        // 4. Update UI Context
        if (window.updateCapSidebar) {
            window.updateCapSidebar();
        }
    };

}

/**
 * Start the Draft Phase
 */
window.startDraftPhase = function() {
    console.log("Starting Draft Phase");
    location.hash = "#/draft";
    if (window.renderDraft) window.renderDraft();
};

/**
 * Start Free Agency Phase
 */
window.startFreeAgencyPhase = function() {
    console.log("Starting Free Agency Phase");
    location.hash = "#/freeagency";
    if (window.renderFreeAgency) window.renderFreeAgency();
};

console.log('✅ Offseason System loaded');
