
import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        print("Navigating to http://localhost:3000...")
        try:
            await page.goto("http://localhost:3000", timeout=30000)
            # Wait for network idle to ensure initial load is done
            # await page.wait_for_load_state("networkidle")
        except Exception as e:
            print(f"Error navigating: {e}")
            await browser.close()
            return

        # Debug: Check if "New League" text exists anywhere
        content = await page.content()
        if "New League" in content:
            print("Text 'New League' found in page content.")
        else:
            print("Text 'New League' NOT found in page content.")
            print(f"Content snippet: {content[:500]}")

        # Try to find and click the button
        try:
            # Using a more generic text locator first to be safe
            btn = page.locator("text=New League")
            if await btn.is_visible(timeout=5000):
                print("Found 'New League' element. Clicking...")
                await btn.click()

                # Wait for dashboard
                print("Waiting for dashboard (Standings/Season)...")
                try:
                    await page.wait_for_selector("text=Season", timeout=30000)
                    print("Dashboard loaded.")
                except:
                    print("Timed out waiting for Dashboard.")
                    await page.screenshot(path="error_waiting_dashboard.png")
            else:
                print("'New League' element not visible.")

                # Check if we are already on dashboard
                if await page.locator("text=Season").is_visible():
                    print("Already on Dashboard.")
                else:
                    print("Unknown state.")
                    await page.screenshot(path="error_unknown_state.png")
                    await browser.close()
                    return

        except Exception as e:
            print(f"Error interacting with landing page: {e}")
            await page.screenshot(path="error_interaction.png")
            await browser.close()
            return

        # 4. Switch to "History" tab
        print("Switching to History tab...")
        try:
            # Click the tab button with text "History"
            # It might be in a list or just a button
            await page.click("button:has-text('History')")

            await page.wait_for_selector("h2:has-text('League History')", timeout=5000)
            print("History tab verified.")

        except Exception as e:
            print(f"Error in History tab: {e}")
            await page.screenshot(path="error_history_tab.png")
            # Continue to Roster test anyway? No, might as well stop if nav fails.
            # But let's try Roster too just in case history is the only broken part.

        # 5. Verify Player Profile Modal (via Roster tab)
        print("Switching to Roster tab...")
        try:
            await page.click("button:has-text('Roster')")
            await page.wait_for_selector("table tbody tr", timeout=10000)

            print("Clicking a player...")
            # Click the first cell of the first row
            await page.locator("table tbody tr td").first.click()

            # Look for Profile Modal
            # It should have "Attributes" or "Career Stats"
            # Wait for a bit more generic selector just in case
            await page.wait_for_selector("div[role='dialog'], .modal, text=Attributes", timeout=5000)
            print("Player Profile verified.")

        except Exception as e:
            print(f"Error in Player Profile test: {e}")
            await page.screenshot(path="error_player_profile.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
