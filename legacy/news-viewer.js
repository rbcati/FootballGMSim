export function renderNewsroom() {
    console.log("Rendering Newsroom...");
    const container = document.getElementById('news');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <div class="row">
                <h2>League Newsroom</h2>
                <div class="spacer"></div>
                <div class="muted">Week ${window.state.league.week}, ${window.state.league.year}</div>
            </div>

            <div class="news-filters" style="margin-bottom: 20px; display: flex; gap: 10px;">
                <button class="btn active" onclick="filterNews('all')">All</button>
                <button class="btn" onclick="filterNews('game')">Games</button>
                <button class="btn" onclick="filterNews('story')">Stories</button>
                <button class="btn" onclick="filterNews('stats')">Stats</button>
                <button class="btn" onclick="filterNews('transactions')">Transactions</button>
            </div>

            <div id="news-feed" class="news-feed">
                <!-- News items will be injected here -->
            </div>
        </div>
    `;

    renderNewsList('all');

    // Attach filter function to window for the onclick handlers
    window.filterNews = (type) => {
        // Update button states
        const buttons = container.querySelectorAll('.news-filters .btn');
        buttons.forEach(btn => {
            if (btn.innerText.toLowerCase().includes(type) || (type === 'all' && btn.innerText === 'All')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        renderNewsList(type);
    };
}

function renderNewsList(filterType) {
    const feed = document.getElementById('news-feed');
    if (!feed) return;

    const league = window.state.league;
    if (!league.news || league.news.length === 0) {
        feed.innerHTML = '<p class="muted" style="text-align: center; padding: 20px;">No news stories available yet.</p>';
        return;
    }

    let news = league.news;
    if (filterType !== 'all') {
        news = news.filter(item => item.type === filterType);
    }

    // Sort by newest first (assuming array is already pushed in order, so reverse for display if needed,
    // but typically we unshift so 0 is newest. Let's assume unshift.)
    // news-engine.js uses unshift, so index 0 is newest.

    if (news.length === 0) {
        feed.innerHTML = '<p class="muted" style="text-align: center; padding: 20px;">No stories found for this category.</p>';
        return;
    }

    feed.innerHTML = news.map(item => `
        <div class="news-story ${item.type}" style="border-bottom: 1px solid var(--hairline); padding: 15px 0;">
            <div class="story-header" style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span class="tag is-${getBadgeColor(item.type)}">${item.type.toUpperCase()}</span>
                <span class="text-muted small">Week ${item.week}, ${item.year}</span>
            </div>
            <h3 class="story-headline" style="margin-bottom: 8px; color: var(--text);">${item.headline}</h3>
            <p class="story-body" style="color: var(--text-muted); line-height: 1.5;">${item.story}</p>
            ${item.image ? `<img src="${item.image}" alt="Story Image" style="width: 100%; max-width: 400px; border-radius: 8px; margin-top: 10px;">` : ''}
        </div>
    `).join('');
}

function getBadgeColor(type) {
    switch (type) {
        case 'game': return 'info';
        case 'story': return 'warning';
        case 'stats': return 'success';
        case 'transactions': return 'danger';
        case 'playoffs': return 'primary';
        default: return 'dark';
    }
}

export function showDecisionModal(event) {
    console.log("Showing Decision Modal:", event);

    // Check if modal already exists
    let modal = document.getElementById('decisionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'decisionModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-card">
            <div class="modal-header" style="border-bottom: 1px solid var(--hairline); padding-bottom: 10px; margin-bottom: 15px;">
                <h2 style="margin: 0; color: var(--accent);">${event.title}</h2>
            </div>
            <div class="modal-body">
                <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 20px;">${event.description}</p>

                <div class="decision-choices" style="display: flex; flex-direction: column; gap: 10px;">
                    ${event.choices.map((choice, index) => `
                        <button class="btn decision-btn" data-index="${index}" style="justify-content: flex-start; text-align: left; padding: 15px;">
                            <div>
                                <div style="font-weight: bold; margin-bottom: 4px;">${choice.text}</div>
                                ${choice.description ? `<div style="font-size: 0.85rem; opacity: 0.8;">${choice.description}</div>` : ''}
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    modal.hidden = false;
    modal.style.display = 'flex';

    // Add event listeners
    const buttons = modal.querySelectorAll('.decision-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const choice = event.choices[index];

            // Execute choice effect
            const resultText = choice.effect({
                league: window.state.league,
                team: window.state.league.teams[window.state.userTeamId],
                week: window.state.league.week
            });

            // Show result
            modal.innerHTML = `
                <div class="modal-card">
                    <div class="modal-header">
                        <h2 style="margin: 0;">Decision Result</h2>
                    </div>
                    <div class="modal-body">
                        <div class="result-message" style="padding: 15px; background: var(--surface); border-radius: 8px; border-left: 4px solid var(--success); margin-bottom: 20px;">
                            ${resultText}
                        </div>
                        <button class="btn primary" id="closeDecisionModal" style="width: 100%;">Continue</button>
                    </div>
                </div>
            `;

            document.getElementById('closeDecisionModal').addEventListener('click', () => {
                modal.hidden = true;
                modal.style.display = 'none';

                // Refresh Hub if visible
                if (window.renderHub && document.getElementById('hub').style.display !== 'none') {
                    window.renderHub();
                }
            });

            // Save state
            if (window.saveGame) window.saveGame();
        });
    });
}

// Attach to window for global access if needed
window.renderNewsroom = renderNewsroom;
window.showDecisionModal = showDecisionModal;
