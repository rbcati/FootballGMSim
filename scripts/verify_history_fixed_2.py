from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:3000")

            # Check for New League button
            try:
                if page.is_visible("text=New League"):
                    print("New League button found. Clicking...")
                    page.click("text=New League")
                    # Wait for loading text or dashboard
            except:
                pass

            # 1. Wait for League Dashboard to load (Season s1)
            print("Waiting for dashboard...")
            page.wait_for_selector("text=Season s1", timeout=20000)
            print("Dashboard loaded.")

            # 2. Click History Tab
            print("Clicking History tab...")
            page.click("button:has-text('History')")

            # 3. Verify Empty State
            print("Verifying empty history state...")
            # It should show "No history available yet"
            page.wait_for_selector("text=No history available yet", timeout=5000)
            print("History tab empty state verified.")

            # 4. Click Roster Tab to find a player
            print("Clicking Roster tab...")
            page.click("button:has-text('Roster')")

            # Wait for table to load
            page.wait_for_selector("table.standings-table", timeout=5000)

            # 5. Click a player name (3rd column of first row)
            print("Clicking a player name...")
            # We assume the first row exists.
            # Columns: # (0), POS (1), Name (2)
            player_cell = page.locator("table tbody tr").first.locator("td").nth(2)
            player_name = player_cell.inner_text()
            print(f"Clicking player: {player_name}")
            player_cell.click()

            # 6. Verify Player Profile Modal
            print("Verifying Player Profile modal...")
            # Header "Career Stats" or the player name in the modal
            page.wait_for_selector("text=Career Stats", timeout=5000)
            page.wait_for_selector(f"h2:has-text('{player_name}')", timeout=5000)
            print("Player Profile modal verified.")

            print("SUCCESS: History tab and Player Profile verified.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="error_history_2.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    run()
