// relocation-viewer.js - UI for Relocation
'use strict';

import relocationManager from './relocation.js';

function renderRelocationPage() {
    const container = document.getElementById('relocation') || createRelocationView();
    const L = window.state.league;
    const teamId = window.state.userTeamId;
    const team = L.teams[teamId];

    // Check if owner mode is enabled
    if (!window.state.ownerMode?.enabled) {
        container.innerHTML = `
            <div class="card">
                <h2>Franchise Relocation</h2>
                <p>You must enable <strong>Owner Mode</strong> to relocate your franchise.</p>
                <button class="btn primary" onclick="location.hash='#/hub'">Back to Hub</button>
            </div>
        `;
        return;
    }

    const availableMarkets = relocationManager.getAvailableMarkets(L);

    container.innerHTML = `
        <div class="card">
            <h2>Franchise Relocation: ${team.name}</h2>
            <p>Moving your franchise is a major decision. Consider market size, cost, and fan loyalty.</p>

            <div class="grid two">
                <div>
                    <h3>Select Market</h3>
                    <div class="market-list" id="marketList">
                        ${availableMarkets.map((m, idx) => `
                            <div class="market-item card ${idx === 0 ? 'selected' : ''}" onclick="selectMarket(${idx})" data-idx="${idx}">
                                <div class="row">
                                    <strong>${m.city}</strong>
                                    <span class="tag">${m.size} Market</span>
                                </div>
                                <div class="muted">Region: ${m.region} | Cost: $${m.cost}M</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div>
                    <h3>Rebranding</h3>
                    <div id="relocationConfig" class="card" style="background: rgba(0,0,0,0.2);">
                        <!-- Filled by JS -->
                    </div>

                    <div class="actions mt">
                        <button class="btn primary" id="btnConfirmRelocation">Confirm Relocation</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize selection
    window.selectedMarketIndex = 0;
    updateConfigView(availableMarkets[0]);

    // Attach Confirm Listener
    document.getElementById('btnConfirmRelocation').addEventListener('click', () => {
        const market = availableMarkets[window.selectedMarketIndex];
        const name = document.getElementById('inputTeamName').value;
        const abbr = document.getElementById('inputTeamAbbr').value;
        // Colors not implemented in UI yet for simplicity

        const result = relocationManager.relocateTeam(L, teamId, window.selectedMarketIndex, name, abbr);

        if (result.success) {
            window.setStatus(result.message, 'success');
            location.hash = '#/hub';
        } else {
            window.setStatus(result.message, 'error');
        }
    });
}

function createRelocationView() {
    const content = document.querySelector('.content');
    const view = document.createElement('section');
    view.id = 'relocation';
    view.className = 'view';
    content.appendChild(view);
    return view;
}

window.selectMarket = function(idx) {
    const items = document.querySelectorAll('.market-item');
    items.forEach(i => i.classList.remove('selected'));
    items[idx].classList.add('selected');

    window.selectedMarketIndex = idx;
    const markets = relocationManager.getAvailableMarkets(window.state.league);
    updateConfigView(markets[idx]);
};

function updateConfigView(market) {
    const config = document.getElementById('relocationConfig');
    if (!config) return;

    config.innerHTML = `
        <div class="form-group">
            <label>City</label>
            <input type="text" value="${market.city}" disabled>
        </div>
        <div class="form-group">
            <label>Team Name</label>
            <input type="text" id="inputTeamName" value="${market.name}">
        </div>
        <div class="form-group">
            <label>Abbreviation</label>
            <input type="text" id="inputTeamAbbr" value="${market.abbr}" maxlength="3">
        </div>
        <div class="info-box">
            <p><strong>Relocation Fee:</strong> $${market.cost}M</p>
        </div>
    `;
}

window.renderRelocationPage = renderRelocationPage;
export { renderRelocationPage };
