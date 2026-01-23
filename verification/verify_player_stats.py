from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:8000")

        # 2. Handle Onboarding Modal if present
        print("Checking for onboarding modal...")
        try:
            page.wait_for_selector("#onboardStart, #hub", timeout=10000)

            if page.is_visible("#onboardStart"):
                print("Onboarding modal found. Starting new league...")
                page.click("#onboardStart")
                page.wait_for_selector("#hub", timeout=10000)
                print("Hub loaded.")
            else:
                print("Hub already visible.")
        except Exception as e:
            print(f"Error during onboarding check: {e}")

        # 3. Go to Roster view
        print("Navigating to Roster...")
        try:
            page.click("a[data-view='roster']")

            # 4. Wait for Roster table to populate
            print("Waiting for roster table...")
            page.wait_for_selector("#rosterTable tr[data-player-id]", timeout=10000)

            # 5. Click on the first player
            print("Clicking first player...")
            first_player_row = page.locator("#rosterTable tr[data-player-id]").first
            first_player_row.click()

            # 6. Wait for Player Profile View
            print("Waiting for player profile view...")
            page.wait_for_selector("#playerProfile", state="visible", timeout=5000)

            # 7. Verify Skill Tree section is present
            print("Verifying Skill Tree section...")
            expect(page.locator("#playerProfile .progression-panel")).to_be_visible()
            # Use get_by_text correctly
            expect(page.locator("#playerProfile").get_by_text("Progression & Skill Tree")).to_be_visible()

            # 8. Screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/verification_player_stats_final.png")
            print("Screenshot saved.")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="verification/verification_failure.png")
            raise e

        browser.close()

if __name__ == "__main__":
    run()
