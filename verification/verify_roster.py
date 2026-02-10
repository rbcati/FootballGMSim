
import time
from playwright.sync_api import sync_playwright, expect

def verify_roster_rendering():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 2000}) # taller viewport
        page = context.new_page()

        # 1. Navigate to the app
        print("Navigating to http://localhost:3000...")
        page.goto("http://localhost:3000")

        # 2. Check for onboarding modal
        try:
            page.wait_for_timeout(2000)
            onboard_modal = page.locator("#onboardModal")
            if onboard_modal.is_visible():
                print("Onboarding modal found. Starting new league...")
                page.click("#onboardStart")
                page.wait_for_selector("#hub", state="visible", timeout=10000)
            else:
                print("Onboarding modal not visible. Assuming loaded state.")
        except Exception as e:
            print(f"Error during onboarding check: {e}")

        # 3. Navigate to Roster View
        print("Navigating to Roster view...")
        page.goto("http://localhost:3000/#/roster")

        # 4. Wait for Roster Table
        print("Waiting for roster table...")
        try:
            page.wait_for_selector("#rosterTable tbody tr", state="visible", timeout=5000)

            # Scroll to table
            table = page.locator("#rosterTable")
            table.scroll_into_view_if_needed()

            # Take screenshot of the table area
            print("Taking screenshot of table...")
            page.screenshot(path="/home/jules/verification/roster_table.png")
            print("Screenshot saved to /home/jules/verification/roster_table.png")

        except Exception as e:
            print(f"Error waiting for roster content: {e}")
            raise e

        browser.close()

if __name__ == "__main__":
    verify_roster_rendering()
