from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Load the game
        print("Loading game...")
        page.goto("http://localhost:8080")

        try:
            page.wait_for_load_state('networkidle')
            time.sleep(2)

            if page.is_visible("#hub") and page.is_visible("#hubSeason"):
                print("Landed on Hub.")
            elif page.is_visible("#onboardModal") and page.is_visible("#onboardStart"):
                print("Onboarding modal open.")
                page.click("#onboardStart")
                page.wait_for_selector("#hub", state="visible", timeout=60000)
                print("Hub loaded after creation.")
            elif page.is_visible("#new-league-name"):
                print("On Dashboard.")
                page.fill("#new-league-name", "TestLeague_" + str(int(time.time())))
                page.click("#create-league-btn")
                page.wait_for_selector("#onboardStart", state="visible")
                page.click("#onboardStart")
                page.wait_for_selector("#hub", state="visible", timeout=60000)
                print("Hub loaded after creation.")
            else:
                print("Unknown state. Taking screenshot.")
                page.screenshot(path="verification/unknown_state.png")
                return

        except Exception as e:
            print(f"Load/Create failed: {e}")
            page.screenshot(path="verification/error_load.png")
            return

        # 3. Go to Schedule
        print("Navigating to Schedule...")
        page.evaluate("location.hash = '#/schedule'")
        page.wait_for_selector("#scheduleWrap", timeout=10000)
        print("Schedule view loaded.")

        # 4. Watch Live Game
        print("Starting Watch Live...")
        time.sleep(1)
        btns = page.query_selector_all(".watch-live-btn")
        if len(btns) > 0:
            btns[0].click()

            try:
                # Wait for game sim view
                page.wait_for_selector("#game-sim", state="visible", timeout=10000)
                print("Game Sim View visible.")

                # Check for content (Scoreboard)
                page.wait_for_selector(".scoreboard", state="visible", timeout=5000)
                print("Scoreboard visible (No Crash).")

                time.sleep(3)
                page.screenshot(path="verification/live_game.png")
                print("Screenshot taken.")

                # Navigate back to hub to test persistence
                print("Navigating back to Hub...")
                page.evaluate("location.hash = '#/hub'")
                page.wait_for_selector("#hub", state="visible")
            except Exception as e:
                print(f"Live Game failed: {e}")
                page.screenshot(path="verification/error_live.png")
        else:
            print("No watch live buttons found.")
            page.screenshot(path="verification/schedule.png")

        # 5. Save
        print("Testing Save...")
        page.evaluate("window.saveGame()")
        time.sleep(1)

        page.screenshot(path="verification/final_state.png")
        print("Final screenshot taken.")
        browser.close()

if __name__ == "__main__":
    run()
