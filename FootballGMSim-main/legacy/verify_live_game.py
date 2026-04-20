from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to app...")
            page.goto("http://localhost:3000/#/game-sim")

            # Wait for JS to load
            page.wait_for_timeout(2000)

            print("Injecting Test State...")
            page.evaluate("""
                console.log("Starting Injection...");

                // Ensure LiveGameViewer exists
                if (!window.liveGameViewer) {
                    console.log("Creating new Viewer");
                    window.liveGameViewer = new LiveGameViewer();
                }

                // Mock Game State
                const homeTeam = { id: 0, abbr: 'HOME', color: '#003366', name: 'Home Team' };
                const awayTeam = { id: 1, abbr: 'AWAY', color: '#990000', name: 'Away Team' };

                window.liveGameViewer.gameState = {
                    home: { team: homeTeam, score: 20, distance: 10, down: 1, yardLine: 20 },
                    away: { team: awayTeam, score: 14, distance: 10, down: 1, yardLine: 20 },
                    quarter: 4,
                    time: 120,
                    ballPossession: 'home',
                    stats: { home: { players: {} }, away: { players: {} } },
                    quarterScores: { home: [0,0,0,20], away: [7,7,0,0] },
                    momentum: 80,
                    drive: { plays: 5, yards: 60 }
                };

                window.liveGameViewer.userTeamId = 0; // User is Home

                // Force Render to body if route didn't pick it up
                if (!document.getElementById('game-sim')) {
                    document.body.innerHTML = '<div id="game-sim" style="height: 800px; width: 100%;"></div>';
                }

                window.liveGameViewer.renderToView('#game-sim');

                // Force Render Play: Touchdown
                setTimeout(() => {
                    console.log("Rendering Touchdown...");
                    window.liveGameViewer.renderPlay({
                        type: 'play',
                        playType: 'pass_long',
                        result: 'touchdown',
                        yards: 35,
                        message: 'TOUCHDOWN! Cannon Blast!',
                        offense: 0,
                        defense: 1,
                        quarter: 4,
                        time: 115,
                        down: 1,
                        distance: 10,
                        yardLine: 100
                    });
                }, 500);
            """)

            # Wait for animation (confetti + overlay)
            print("Waiting for animation...")
            page.wait_for_timeout(2000)

            # Take screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification_touchdown.png", full_page=True)
            print("Screenshot saved.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
