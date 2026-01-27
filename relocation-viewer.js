// relocation-viewer.js - UI for Franchise Relocation
'use strict';

let currentStep = 1;
let selectedMarketId = null;
let selectedStadiumId = 'standard';
let teamIdentity = {
    name: '',
    abbr: '',
    primaryColor: '#000000',
    secondaryColor: '#ffffff'
};

function renderRelocationPage() {
    const container = document.getElementById('relocation');
    if (!container) return;

    // Reset state on initial load
    if (container.innerHTML === '') {
        currentStep = 1;
        selectedMarketId = null;
        selectedStadiumId = 'standard';

        // Pre-fill identity from current team
        const team = window.state.league.teams[window.state.userTeamId];
        if (team) {
            teamIdentity.name = team.name.split(' ').slice(1).join(' ') || 'Team';
            teamIdentity.abbr = team.abbr;
            teamIdentity.primaryColor = team.colors ? team.colors.primary : '#000000';
            teamIdentity.secondaryColor = team.colors ? team.colors.secondary : '#ffffff';
        }
    }

    // Check Eligibility
    const eligibility = window.RelocationManager.canRelocate(window.state.userTeamId);
    if (!eligibility.allowed) {
        container.innerHTML = `
            <div class="card">
                <h2>Franchise Relocation</h2>
                <div class="alert alert-danger">
                    <strong>Relocation Unavailable</strong><br>
                    ${eligibility.reason}
                </div>
                <button class="btn" onclick="location.hash='#/hub'">Back to Hub</button>
            </div>
        `;
        return;
    }

    renderWizard(container);
}

function renderWizard(container) {
    let content = '';

    if (currentStep === 1) {
        content = renderMarketSelection();
    } else if (currentStep === 2) {
        content = renderTeamIdentity();
    } else if (currentStep === 3) {
        content = renderStadiumSelection();
    } else if (currentStep === 4) {
        content = renderConfirmation();
    }

    container.innerHTML = `
        <div class="card">
            <div class="row">
                <h2>Franchise Relocation</h2>
                <div class="spacer"></div>
                <div class="step-indicator">Step ${currentStep} of 4</div>
            </div>

            <div class="wizard-content mt-3">
                ${content}
            </div>

            <div class="wizard-actions row mt-4">
                ${currentStep > 1 ? `<button class="btn" onclick="prevStep()">Back</button>` : `<button class="btn" onclick="location.hash='#/hub'">Cancel</button>`}
                <div class="spacer"></div>
                ${currentStep < 4 ? `<button class="btn primary" onclick="nextStep()" ${currentStep === 1 && !selectedMarketId ? 'disabled' : ''}>Next</button>` : `<button class="btn primary" onclick="confirmRelocation()">Confirm Relocation</button>`}
            </div>
        </div>
    `;
}

function renderMarketSelection() {
    const markets = window.RelocationManager.getEligibleMarkets();

    return `
        <h3>Step 1: Choose a New Market</h3>
        <p class="mb-3">Select a city for your franchise. Consider market size, fan interest, and relocation costs.</p>
        <div class="market-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
            ${markets.map(m => `
                <div class="market-card ${selectedMarketId === m.id ? 'selected' : ''}"
                     onclick="selectMarket('${m.id}')"
                     style="border: 2px solid ${selectedMarketId === m.id ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}; padding: 15px; border-radius: 8px; cursor: pointer; background: rgba(0,0,0,0.2);">
                    <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 5px;">${m.city}, ${m.state}</div>
                    <div class="small muted">Pop: ${(m.population / 1000000).toFixed(1)}M • ${m.marketSize} Market</div>
                    <div class="mt-2">
                        <div>Interest: <span class="${getRatingClass(m.interest)}">${m.interest}</span></div>
                        <div>Loyalty: <span class="${getRatingClass(m.loyalty)}">${m.loyalty}</span></div>
                    </div>
                    <div class="mt-2" style="font-weight: bold; color: #ff6b6b;">Fee: $${(m.cost / 1000000).toFixed(0)}M</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTeamIdentity() {
    const market = window.RelocationManager.getMarketById(selectedMarketId);
    return `
        <h3>Step 2: Rebrand Your Team</h3>
        <p class="mb-3">Moving to <strong>${market.city}</strong>. Update your team's identity.</p>

        <div class="form-group mb-3">
            <label>Team Name (Suffix)</label>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.2rem; font-weight: bold;">${market.city}</span>
                <input type="text" id="identityName" value="${teamIdentity.name}" oninput="updateIdentity('name', this.value)" placeholder="e.g. Thunder">
            </div>
        </div>

        <div class="form-group mb-3">
            <label>Abbreviation (3 Letters)</label>
            <input type="text" id="identityAbbr" value="${teamIdentity.abbr}" maxlength="3" oninput="updateIdentity('abbr', this.value.toUpperCase())">
        </div>

        <div class="row">
            <div class="form-group">
                <label>Primary Color</label>
                <input type="color" id="identityPrimary" value="${teamIdentity.primaryColor}" onchange="updateIdentity('primaryColor', this.value)">
            </div>
            <div class="form-group">
                <label>Secondary Color</label>
                <input type="color" id="identitySecondary" value="${teamIdentity.secondaryColor}" onchange="updateIdentity('secondaryColor', this.value)">
            </div>
        </div>

        <div class="preview-box mt-4" style="padding: 20px; border-radius: 8px; background: linear-gradient(135deg, ${teamIdentity.primaryColor}, ${teamIdentity.secondaryColor}); text-align: center; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
            <h1 style="margin: 0;">${market.city} ${teamIdentity.name || '...'}</h1>
            <div style="font-size: 3rem; font-weight: 900; opacity: 0.3;">${teamIdentity.abbr || '...'}</div>
        </div>
    `;
}

function renderStadiumSelection() {
    return `
        <h3>Step 3: Build Your Stadium</h3>
        <p class="mb-3">Choose a stadium plan. Better stadiums cost more but improve revenue and fan happiness.</p>
        <div class="stadium-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            ${window.STADIUM_TIERS.map(s => `
                <div class="stadium-card ${selectedStadiumId === s.id ? 'selected' : ''}"
                     onclick="selectStadium('${s.id}')"
                     style="border: 2px solid ${selectedStadiumId === s.id ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}; padding: 15px; border-radius: 8px; cursor: pointer; background: rgba(0,0,0,0.2); text-align: center;">
                    <div style="font-size: 3rem;">🏟️</div>
                    <div style="font-weight: bold; font-size: 1.1rem; margin: 10px 0;">${s.name}</div>
                    <div class="muted">Capacity: ${s.capacity.toLocaleString()}</div>
                    <div class="muted">Bonus: +${s.bonus}% Revenue</div>
                    <div class="mt-3" style="font-weight: bold; color: #ff6b6b;">$${(s.cost / 1000000).toFixed(0)}M</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderConfirmation() {
    const market = window.RelocationManager.getMarketById(selectedMarketId);
    const stadium = window.STADIUM_TIERS.find(s => s.id === selectedStadiumId);
    const totalCost = window.RelocationManager.calculateTotalCost(selectedMarketId, selectedStadiumId);

    return `
        <h3>Step 4: Confirm Relocation</h3>
        <div class="confirmation-summary" style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 8px;">
            <div class="row mb-2">
                <span class="muted">New Location:</span>
                <strong>${market.city}, ${market.state}</strong>
            </div>
            <div class="row mb-2">
                <span class="muted">New Name:</span>
                <strong>${market.city} ${teamIdentity.name} (${teamIdentity.abbr})</strong>
            </div>
            <div class="row mb-2">
                <span class="muted">Stadium:</span>
                <strong>${stadium.name} (${stadium.capacity.toLocaleString()} seats)</strong>
            </div>
            <div class="divider" style="border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0;"></div>
            <div class="row mb-2">
                <span class="muted">Relocation Fee:</span>
                <span>$${(market.cost / 1000000).toFixed(1)}M</span>
            </div>
            <div class="row mb-2">
                <span class="muted">Stadium Cost:</span>
                <span>$${(stadium.cost / 1000000).toFixed(1)}M</span>
            </div>
            <div class="row" style="font-size: 1.2rem; font-weight: bold; margin-top: 10px;">
                <span>Total Cost:</span>
                <span style="color: #ff6b6b;">$${(totalCost / 1000000).toFixed(1)}M</span>
            </div>
        </div>
        <div class="alert alert-warning mt-3">
            ⚠️ This action is permanent. The cost will be deducted from your team's finances immediately.
        </div>
    `;
}

// Actions
window.selectMarket = (id) => {
    selectedMarketId = id;
    renderRelocationPage(); // Re-render to update selection UI
};

window.selectStadium = (id) => {
    selectedStadiumId = id;
    renderRelocationPage();
};

window.updateIdentity = (field, value) => {
    teamIdentity[field] = value;
    // Re-render only if needed, or just update preview DOM for performance?
    // For simplicity, re-render step 2
    if (currentStep === 2) {
        // Just update the preview box directly to avoid losing focus
        if (field === 'name') document.querySelector('.preview-box h1').textContent = `${window.RelocationManager.getMarketById(selectedMarketId).city} ${value}`;
        if (field === 'abbr') document.querySelector('.preview-box div').textContent = value;
        if (field.includes('Color')) document.querySelector('.preview-box').style.background = `linear-gradient(135deg, ${teamIdentity.primaryColor}, ${teamIdentity.secondaryColor})`;
    }
};

window.nextStep = () => {
    if (currentStep < 4) {
        currentStep++;
        renderRelocationPage();
    }
};

window.prevStep = () => {
    if (currentStep > 1) {
        currentStep--;
        renderRelocationPage();
    }
};

window.confirmRelocation = () => {
    const result = window.RelocationManager.relocateTeam(window.state.userTeamId, {
        marketId: selectedMarketId,
        stadiumTierId: selectedStadiumId,
        newName: teamIdentity.name,
        newAbbr: teamIdentity.abbr,
        primaryColor: teamIdentity.primaryColor,
        secondaryColor: teamIdentity.secondaryColor
    });

    if (result.success) {
        window.setStatus(result.message, 'success');
        location.hash = '#/hub';
    } else {
        window.setStatus(result.message, 'error');
    }
};

// Helper
function getRatingClass(rating) {
    if (rating === 'High' || rating === 'Very High') return 'text-success';
    if (rating === 'Medium') return 'text-warning';
    return 'text-danger';
}

// Export
window.renderRelocationPage = renderRelocationPage;
