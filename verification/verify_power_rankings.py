from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 720})

        # 1. Load Game
        print("Loading game...")
        page.goto("http://localhost:8000")

        # 2. Start New League (if needed, usually it shows onboard modal)
        # Check if onboard modal is visible
        print("Checking for onboard modal...")
        try:
            # Wait a bit for JS to init
            time.sleep(1)

            # Check if modal is there
            if page.is_visible("#onboardModal:not([hidden])"):
                print("Onboard modal found.")
                page.click("#onboardStart")
                print("Started new league.")
            else:
                print("No onboard modal visible immediately.")
                # Maybe click "New League" if sidebar is visible?
                if page.is_visible("#btnNewLeague"):
                    print("Clicking New League button...")
                    page.click("#btnNewLeague")
                    page.wait_for_selector("#onboardModal:not([hidden])")
                    page.click("#onboardStart")
        except Exception as e:
            print(f"Error during onboarding: {e}")


        # 3. Wait for Hub
        print("Waiting for Hub...")
        try:
            page.wait_for_selector("#hub", state="visible", timeout=10000)
        except:
            print("Hub not visible, dumping content...")
            # print(page.content())

        # 4. Navigate to Power Rankings
        print("Navigating to Power Rankings...")
        # Try clicking the link
        try:
            page.click("a[href='#/powerRankings']")
        except:
            print("Could not click link, forcing hash...")
            page.evaluate("window.location.hash = '#/powerRankings'")

        # 5. Wait for Power Rankings view
        print("Waiting for Power Rankings view...")
        page.wait_for_selector("#powerRankings", state="visible")

        # Wait for table content
        try:
            page.wait_for_selector("#powerRankingsBody tr", timeout=5000)
        except:
            print("Table rows not found!")

        # 6. Take Screenshot
        print("Taking screenshot...")
        time.sleep(2) # Let render finish
        page.screenshot(path="verification/power_rankings.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
