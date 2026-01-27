
import os

def modify_ui_js():
    with open('ui.js', 'r') as f:
        content = f.read()

    # 1. Replace the Grid Two section (Quick Actions + League Actions) with (Week HQ + Quick Actions)
    search_str = """                    <div class="grid two">
                        <div>
                            <h3>Quick Actions</h3>
                            <div class="actions" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px;">
                                <button class="btn" onclick="location.hash='#/roster'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">👥</span>
                                    Roster
                                </button>
                                <button class="btn" onclick="location.hash='#/trade'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">⇄</span>
                                    Trade
                                </button>
                                <button class="btn" onclick="location.hash='#/freeagency'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">✍️</span>
                                    Sign
                                </button>
                                <button class="btn" onclick="location.hash='#/draft'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">🎓</span>
                                    Draft
                                </button>
                                <button class="btn" onclick="location.hash='#/schedule'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">📅</span>
                                    Sched
                                </button>
                                <button class="btn" onclick="window.openTrainingMenu()" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">🏋️</span>
                                    Train
                                </button>
                            </div>
                        </div>
                        <div>
                            <h3>League Actions</h3>
                            <div class="actions" style="display: flex; flex-direction: column; gap: 8px;">
                                ${!isOffseason ? '<button class="btn" id="btnSimSeason" onclick="handleSimulateSeason()" style="justify-content: center;">Simulate Season</button>' : ''}
                                ${(!isOffseason && L.week > 18 && (!window.state?.playoffs || !window.state.playoffs.winner))
                                    ? `<button class="btn primary" onclick="if(window.startPlayoffs) window.startPlayoffs();" style="justify-content: center;">Start Playoffs</button>`
                                    : ''
                                }
                                <button class="btn" onclick="location.hash='#/standings'" style="justify-content: center;">View Standings</button>
                                ${isOffseason ? `<button class="btn primary" id="btnStartNewSeason" style="justify-content: center; padding: 12px;">Start ${(L?.year || 2025) + 1} Season</button>` : ''}
                            </div>
                        </div>
                    </div>"""

    replace_str = """                    <div class="grid two">
                        <div>
                            <h3>Week HQ</h3>
                            <div class="week-hq-card" style="background: var(--surface); padding: 15px; border-radius: 8px; border: 1px solid var(--hairline);">
                                <ul class="week-checklist" style="list-style: none; padding: 0; margin: 0 0 15px 0;">
                                    <li style="margin-bottom: 5px;">✅ <strong>Gameplan:</strong> Set</li>
                                    <li style="margin-bottom: 5px;">${window.state.scouting && window.state.scouting.used < window.state.scouting.budget ? '⚠️' : '✅'} <strong>Scouting:</strong> ${window.state.scouting ? Math.round((window.state.scouting.budget - window.state.scouting.used)/1000) + 'k left' : 'N/A'}</li>
                                    <li>✅ <strong>Training:</strong> Normal</li>
                                </ul>

                                ${!isOffseason ? `
                                    <button class="btn primary large" id="btnSimWeekHQ" style="width: 100%; padding: 15px; font-size: 1.1rem; justify-content: center; font-weight: bold; margin-bottom: 10px;">
                                        Advance Week >
                                    </button>
                                ` : ''}

                                <button class="btn btn-sm" id="btnSimSeason" onclick="handleSimulateSeason()" style="width: 100%; justify-content: center; opacity: 0.7;">Simulate Season</button>

                                ${(!isOffseason && L.week > 18 && (!window.state?.playoffs || !window.state.playoffs.winner))
                                    ? `<button class="btn primary" onclick="if(window.startPlayoffs) window.startPlayoffs();" style="justify-content: center; width: 100%;">Start Playoffs</button>`
                                    : ''
                                }

                                ${isOffseason ? `<button class="btn primary" id="btnStartNewSeason" style="justify-content: center; padding: 12px; width: 100%;">Start ${(L?.year || 2025) + 1} Season</button>` : ''}
                            </div>
                        </div>
                        <div>
                            <h3>Quick Actions</h3>
                            <div class="actions" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                                <button class="btn" onclick="location.hash='#/roster'" style="flex-direction: column; padding: 10px; text-align: center;">👥 Roster</button>
                                <button class="btn" onclick="location.hash='#/trade'" style="flex-direction: column; padding: 10px; text-align: center;">⇄ Trade</button>
                                <button class="btn" onclick="location.hash='#/freeagency'" style="flex-direction: column; padding: 10px; text-align: center;">✍️ Sign</button>
                                <button class="btn" onclick="location.hash='#/draft'" style="flex-direction: column; padding: 10px; text-align: center;">🎓 Draft</button>
                                <button class="btn" onclick="location.hash='#/schedule'" style="flex-direction: column; padding: 10px; text-align: center;">📅 Sched</button>
                                <button class="btn" onclick="window.openTrainingMenu()" style="flex-direction: column; padding: 10px; text-align: center;">🏋️ Train</button>
                            </div>
                        </div>
                    </div>"""

    if search_str in content:
        content = content.replace(search_str, replace_str)
        print("Replaced Hub Grid.")
    else:
        print("Could not find Hub Grid string.")

    # 2. Add Event Listener
    search_listener = "            // Add event listeners for simulate buttons\n            const btnSimSeason = hubContainer.querySelector('#btnSimSeason');"
    replace_listener = """            // Add event listeners for simulate buttons
            const btnSimWeekHQ = hubContainer.querySelector('#btnSimWeekHQ');
            if (btnSimWeekHQ) {
                btnSimWeekHQ.addEventListener('click', () => {
                    if (window.simulateWeek) {
                        window.simulateWeek();
                    } else if (window.gameController && window.gameController.handleSimulateWeek) {
                        window.gameController.handleSimulateWeek();
                    }
                });
            }

            const btnSimSeason = hubContainer.querySelector('#btnSimSeason');"""

    if search_listener in content:
        content = content.replace(search_listener, replace_listener)
        print("Replaced Listener.")
    else:
        print("Could not find Listener string.")

    with open('ui.js', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    modify_ui_js()
