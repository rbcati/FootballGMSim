from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Wait for app to load
        page.wait_for_timeout(2000)

        # Check if we need to start a new league
        # Look for "Start Season" button in the modal if it's open
        try:
            start_btn = page.get_by_role("button", name="Start Season")
            if start_btn.is_visible():
                print("Clicking Start Season...")
                start_btn.click()
                page.wait_for_timeout(2000)
        except:
            pass

        # Try finding "Start New Game" if we are on landing
        try:
            new_game_btn = page.get_by_role("button", name="Start New Game")
            if new_game_btn.is_visible():
                print("Clicking Start New Game...")
                new_game_btn.click()
                page.wait_for_timeout(1000)
                # Select team and start
                page.get_by_role("button", name="Start Season").click()
                page.wait_for_timeout(2000)
        except:
            pass

        # Now we should be in the hub.
        print("Injecting Live Game...")
        # We need to make sure the league is loaded.

        # Execute watchLiveGame
        page.evaluate("""
            if (window.watchLiveGame) {
                // Try to find valid team IDs from state
                const teams = window.state?.league?.teams;
                if (teams && teams.length >= 2) {
                    window.watchLiveGame(teams[0].id, teams[1].id);
                } else {
                    console.error("No teams found");
                }
            } else {
                console.error("watchLiveGame not found");
            }
        """)

        page.wait_for_timeout(2000)

        # Wait for a "Next Play" button to appear to confirm we are in game
        try:
            page.wait_for_selector("#btnNextPlay", timeout=5000)
            print("In game!")

            # Click next play a few times
            for _ in range(3):
                page.click("#btnNextPlay")
                page.wait_for_timeout(2000) # Wait for animation

        except Exception as e:
            print(f"Could not confirm game start: {e}")

        # Take a screenshot of the live game view
        page.screenshot(path="verification/live_game_viewer_2.png")
        print("Screenshot saved to verification/live_game_viewer_2.png")

        browser.close()

if __name__ == "__main__":
    run()
