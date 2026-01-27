// relocation-viewer.js - UI for Relocation
'use strict';

function renderRelocationPage() {
    const container = document.getElementById('relocationContainer');
    if (!container) return; // Should be added to index.html

    if (!window.state || !window.state.ownerMode || !window.state.ownerMode.enabled) {
        container.innerHTML = `
            <div class="card error">
                <h2>Access Denied</h2>
                <p>You must be in Owner Mode to relocate your franchise.</p>
                <button class="btn btn-primary" onclick="location.hash='#/hub'">Return to Hub</button>
            </div>
        `;
        return;
    }

    const team = window.state.league.teams[window.state.userTeamId];
    const markets = window.relocationManager.getAvailableMarkets();

    let html = `
        <div class="card">
            <h2>Relocate Franchise</h2>
            <p>Current Location: <strong>${team.city || 'Unknown'}</strong> | Current Market Size: <strong>${team.marketSize || 'Medium'}</strong></p>
            <p>Select a new city for your franchise. Relocation will reset fan satisfaction but can open up new revenue streams.</p>
        </div>

        <div class="card">
            <h3>1. Select New Market</h3>
            <div class="market-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
                ${markets.map(m => `
                    <div class="market-card card selectable" onclick="selectMarket('${m.id}')" id="market-${m.id}" style="cursor: pointer; border: 1px solid #444;">
                        <h4>${m.city}</h4>
                        <div class="small muted">${m.region}</div>
                        <hr style="border-color: #444;">
                        <div>Market Size: <strong>${m.marketSize}</strong></div>
                        <div>Fan Loyalty: <strong>${m.fanLoyalty}/10</strong></div>
                        <div>Team Name: <em>${m.name}</em></div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div id="relocationConfig" class="card" style="display:none;">
            <h3>2. Team Identity</h3>
            <div class="grid two">
                <div>
                    <label>New Team Name</label>
                    <input type="text" id="newTeamName" placeholder="e.g. London Monarchs">

                    <label>Abbreviation (3 chars)</label>
                    <input type="text" id="newTeamAbbr" maxlength="3" placeholder="LON">

                    <label>Primary Color</label>
                    <input type="color" id="newPrimaryColor" value="${team.color || '#000000'}">

                    <label>Secondary Color</label>
                    <input type="color" id="newSecondaryColor" value="${team.secondaryColor || '#ffffff'}">
                </div>
                <div>
                    <label>Preview</label>
                    <div id="teamPreview" style="background: #333; padding: 20px; border-radius: 8px; text-align: center; color: white;">
                        <div id="previewHelmet" style="width: 100px; height: 100px; background: ${team.color || '#000'}; border: 4px solid ${team.secondaryColor || '#fff'}; border-radius: 50%; margin: 0 auto;"></div>
                        <h2 id="previewName" style="margin-top: 10px;">${team.name}</h2>
                    </div>
                </div>
            </div>

            <div class="row mt" style="justify-content: flex-end;">
                <button class="btn btn-danger" onclick="confirmRelocation()">Confirm Relocation</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Attach local state variables
    window.selectedMarketId = null;
}

window.selectMarket = function(id) {
    const market = window.relocationManager.getAvailableMarkets().find(m => m.id === id);
    if (!market) return;

    window.selectedMarketId = id;

    // Visual Selection
    document.querySelectorAll('.market-card').forEach(el => el.style.borderColor = '#444');
    const selectedCard = document.getElementById(`market-${id}`);
    if (selectedCard) selectedCard.style.borderColor = 'var(--accent, #3498db)';

    // Show config
    const config = document.getElementById('relocationConfig');
    if (config) config.style.display = 'block';

    // Pre-fill inputs
    const nameInput = document.getElementById('newTeamName');
    const abbrInput = document.getElementById('newTeamAbbr');

    if (nameInput) nameInput.value = `${market.city} ${market.name}`;
    if (abbrInput) abbrInput.value = market.abbr;

    updatePreview();
}

function updatePreview() {
    const nameInput = document.getElementById('newTeamName');
    const pColorInput = document.getElementById('newPrimaryColor');
    const sColorInput = document.getElementById('newSecondaryColor');

    if (!nameInput || !pColorInput || !sColorInput) return;

    const name = nameInput.value;
    const pColor = pColorInput.value;
    const sColor = sColorInput.value;

    const previewName = document.getElementById('previewName');
    const previewHelmet = document.getElementById('previewHelmet');

    if (previewName) previewName.textContent = name;
    if (previewHelmet) {
        previewHelmet.style.background = pColor;
        previewHelmet.style.borderColor = sColor;
    }
}

// Bind live update
document.addEventListener('input', (e) => {
    if (['newTeamName', 'newPrimaryColor', 'newSecondaryColor'].includes(e.target.id)) {
        updatePreview();
    }
});

window.confirmRelocation = function() {
    if (!window.selectedMarketId) {
        window.setStatus("Please select a market first.", "error");
        return;
    }

    const name = document.getElementById('newTeamName').value;
    const abbr = document.getElementById('newTeamAbbr').value;
    const pColor = document.getElementById('newPrimaryColor').value;
    const sColor = document.getElementById('newSecondaryColor').value;

    if (!name || !abbr) {
        window.setStatus("Please enter a team name and abbreviation.", "error");
        return;
    }

    const result = window.relocationManager.relocateTeam(
        window.state.userTeamId,
        window.selectedMarketId,
        name,
        abbr,
        { primary: pColor, secondary: sColor }
    );

    if (result.success) {
        window.setStatus(result.message, "success");
        // Force refresh of team data in UI
        if (window.updateTeamRatings) window.updateTeamRatings(window.state.league.teams[window.state.userTeamId]);

        // Go to hub
        setTimeout(() => location.hash = '#/hub', 1500);
    } else {
        window.setStatus(result.message, "error");
    }
}

window.renderRelocationPage = renderRelocationPage;
