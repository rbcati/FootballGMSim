
from playwright.sync_api import sync_playwright
import time

def verify_live_game():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        print("Navigating to app...")
        page.goto("http://localhost:3000")

        # Wait for app to load
        page.wait_for_timeout(2000)

        print("Injecting game state...")
        # Inject state and start game
        page.evaluate("""
            window.state = window.state || {};
            // Mock League
            window.state.league = {
                week: 1,
                teams: [
                    { id: 0, name: "Team A", abbr: "TMA", color: "#FF0000", roster: [], stats: { wins: 0, streak: 0 } },
                    { id: 1, name: "Team B", abbr: "TMB", color: "#0000FF", roster: [], stats: { wins: 0, streak: 0 } }
                ],
                weeklyGamePlan: {}
            };
            window.state.userTeamId = 0;

            // Start Game
            window.watchLiveGame(0, 1);
        """)

        print("Waiting for game render...")
        page.wait_for_selector(".football-field-container", timeout=10000)

        # Wait for a bit of simulation
        page.wait_for_timeout(3000)

        # Take screenshot
        screenshot_path = "/home/jules/verification/live_game_screenshot.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_live_game()
