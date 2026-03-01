from playwright.sync_api import sync_playwright
import time

def verify_game_overlay():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to app
        page.goto("http://localhost:3000")
        page.wait_for_load_state("domcontentloaded")
        time.sleep(3)

        # 2. Wait for initialization / New League Flow
        try:
            # Check for "New League" button
            if page.get_by_text("New League").is_visible(timeout=3000):
                print("Clicking New League...")
                page.get_by_text("New League").click()
                time.sleep(1)

                # Check for "Start Career"
                start_career_btn = page.locator("#start-career-btn") # ID from log
                if start_career_btn.is_visible(timeout=3000):
                    # It might be disabled initially (waiting for team selection?)
                    # Select a team first
                    print("Selecting a team (Buffalo Bills)...")
                    page.get_by_text("Buffalo Bills").click()
                    time.sleep(1)

                    print("Clicking Start Career...")
                    start_career_btn.click()
                    time.sleep(8) # Allow heavy league generation
        except Exception as e:
            print(f"Initialization flow error: {e}")

        # 3. Simulate a Week
        try:
            # Look for Advance button
            advance_btn = page.get_by_role("button", name="Advance Week")
            if advance_btn.is_visible(timeout=10000):
                print("Clicking Advance Week...")
                advance_btn.click()

                # Wait for overlay
                time.sleep(5)
                try:
                    # Wait longer for overlay
                    page.wait_for_selector(".game-result-overlay", timeout=20000)
                    print("Overlay appeared!")
                except:
                    print("Overlay did not appear within timeout.")
            else:
                print("Advance button not found - maybe already simulating or wrong page?")
        except Exception as e:
            print(f"Simulation step error: {e}")

        # 4. Take Screenshot of Overlay
        page.screenshot(path="verification/overlay.png")
        print("Overlay screenshot captured.")

        # 5. Check for Streak in Standings
        # Close overlay if present
        try:
            continue_btn = page.get_by_text("Continue")
            if continue_btn.is_visible(timeout=2000):
                print("Closing overlay...")
                continue_btn.click()
                time.sleep(1)
        except:
            pass

        # Ensure we are on standings tab
        try:
            standings_tab = page.get_by_text("Standings", exact=True)
            if standings_tab.is_visible():
                standings_tab.click()
                time.sleep(0.5)
        except:
            pass

        # Take screenshot of dashboard to verify STRK column
        page.screenshot(path="verification/dashboard_streak.png")
        print("Dashboard screenshot captured.")

        browser.close()

if __name__ == "__main__":
    verify_game_overlay()
