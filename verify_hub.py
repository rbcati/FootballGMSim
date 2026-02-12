
import os
from playwright.sync_api import sync_playwright

def verify_hub():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page
        page.goto("http://localhost:8080/index.html")

        # Wait for JS to load
        page.wait_for_timeout(2000)

        # Inject mock state and trigger render
        page.evaluate("""() => {
            const mockLeague = {
                year: 2025,
                week: 2, // Set to week 2 to avoid Owner Gamble modal
                teams: Array(32).fill(0).map((_, i) => ({
                    id: i,
                    name: `Team ${i}`,
                    abbr: `TM${i}`,
                    conf: i < 16 ? 0 : 1,
                    div: Math.floor(i / 4) % 4,
                    wins: i % 5,
                    losses: i % 3,
                    ties: 0,
                    capRoom: 15.5,
                    ratings: {
                        overall: 80 + (i % 10),
                        offense: { overall: 82 + (i % 5) },
                        defense: { overall: 78 + (i % 5) }
                    },
                    roster: Array(53).fill(0).map((_, j) => ({
                        id: j,
                        name: `Player ${j}`,
                        pos: 'QB',
                        ovr: 80
                    }))
                })),
                schedule: {
                    weeks: [
                        {
                            weekNumber: 1,
                            games: [
                                { home: 0, away: 1, played: true, homeScore: 24, awayScore: 17 }
                            ]
                        },
                        {
                            weekNumber: 2,
                            games: [
                                { home: 0, away: 2, played: false }
                            ]
                        }
                    ]
                },
                ownerChallenge: { status: 'ACTIVE' } // Ensure no modal
            };

            window.state = {
                league: mockLeague,
                userTeamId: 0,
                onboarded: true,
                offseason: false
            };

            // Force show hub
            document.querySelectorAll('.view').forEach(v => {
                v.hidden = true;
                v.style.display = 'none';
            });
            const hub = document.getElementById('hub');
            hub.hidden = false;
            hub.style.display = 'block';

            // Remove any modals
            document.querySelectorAll('.modal').forEach(m => m.remove());

            // Force render
            if (window.renderHub) window.renderHub();
        }""")

        # Wait for the hub header to appear
        try:
            page.wait_for_selector(".hub-header", timeout=5000)
        except Exception as e:
            print(f"Error waiting for selectors: {e}")
            page.screenshot(path="verification/verification_error.png")
            return

        # Take screenshot
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/hub_redesign.png", full_page=True)
        print("Screenshot saved to verification/hub_redesign.png")

        browser.close()

if __name__ == "__main__":
    verify_hub()
