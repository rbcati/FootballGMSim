import sys
from playwright.sync_api import sync_playwright
import time

def run():
    print("Starting verification script...")
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Capture console logs and errors
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        try:
            # Navigate to the app (using port 3000 as discovered)
            url = "http://localhost:3000"
            print(f"Navigating to {url}...")

            # Wait for DOM ready
            page.goto(url, wait_until="domcontentloaded", timeout=60000)

            # Allow potential SW reload to settle
            page.wait_for_timeout(3000)

            # Check if we are stuck on loading screen
            loading = page.query_selector("text=Starting game engine...")
            if loading:
                print("Found loading screen. Waiting for it to disappear...")
                try:
                    page.wait_for_selector("text=Starting game engine...", state="detached", timeout=30000)
                    print("Loading screen disappeared.")
                except Exception as e:
                    print(f"Timed out waiting for loading screen to disappear: {e}")
                    # Dump content to debug
                    print("Page content dump:")
                    print(page.content())
                    browser.close()
                    return

            # Wait for "New League" button
            print("Waiting for 'New League' button...")
            try:
                page.wait_for_selector("text=New League", timeout=30000)
                print("Found 'New League' button.")
            except Exception as e:
                print(f"Failed to find 'New League' button: {e}")
                print("Page content dump:")
                print(page.content())
                browser.close()
                return

            # Click "New League"
            print("Clicking 'New League'...")
            page.click("text=New League")

            # Handle potential team select modal/screen if it exists, or just wait for dashboard
            # Assuming 'New League' starts the generation process which might take a moment
            # Wait for "Season" or "Standings" or "League Dashboard"
            print("Waiting for Dashboard (text='Season')...")
            try:
                page.wait_for_selector("text=Season", timeout=60000) # Give extra time for league gen
                print("Dashboard loaded.")
            except Exception as e:
                print(f"Failed to load dashboard: {e}")
                browser.close()
                return

            # 1. Verify "History" tab exists
            print("Verifying 'History' tab...")
            history_tab = page.query_selector("text=History")
            if history_tab:
                print("SUCCESS: History tab found.")
                history_tab.click()
                # Check for history content (e.g. "League History" header or table)
                try:
                    # Accepts either the header (if history exists) or the empty state message
                    if page.locator("text=League History").count() > 0 or \
                       page.locator("text=No history available yet.").count() > 0 or \
                       page.wait_for_selector("text=League History,text=No history available yet.", timeout=10000):
                        print("SUCCESS: League History view loaded (or empty state).")
                except Exception as e:
                    print(f"WARNING: League History check failed: {e}")
            else:
                print("FAILURE: History tab NOT found.")

            # 2. Verify "Player Profile" logic (click a player name)
            # Go to Roster first
            print("Navigating to Roster...")
            page.click("text=Roster")
            page.wait_for_selector("table", timeout=10000) # Wait for roster table

            # Click the first player link/name
            print("Clicking a player to open Profile...")
            # Roster table: #, POS, Name, ...
            # Name is the 3rd column.
            player_link = page.query_selector("tbody tr td:nth-child(3)")
            if player_link:
                player_name = player_link.inner_text()
                print(f"Clicked player: {player_name}")
                player_link.click()
                # Wait for modal or profile view
                try:
                    page.wait_for_selector("text=Career Stats", timeout=10000)
                    print("SUCCESS: Player Profile loaded with Career Stats.")
                except:
                    print("FAILURE: Player Profile did not load or 'Career Stats' text missing.")
            else:
                print("FAILURE: Could not find a player in the roster table.")

        except Exception as e:
            print(f"An unexpected error occurred: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
