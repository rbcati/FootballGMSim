from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8000")
        time.sleep(2)

        # Check for onboarding modal
        print("Checking for onboarding modal...")
        page.screenshot(path="verification/1_onboarding.png")

        # Select team and start
        # If onboardTeam select is disabled/loading, wait
        # page.wait_for_selector("#onboardTeam:not([disabled])", timeout=10000)

        print("Starting season...")
        # Force click start just in case
        page.evaluate("document.getElementById('onboardStart').click()")
        time.sleep(2)

        page.screenshot(path="verification/2_hub.png")

        # Check if we are on hub
        hash = page.evaluate("window.location.hash")
        print(f"Current hash: {hash}")

        if hash == "#/hub":
            print("Successfully reached Hub")
        else:
            print("Failed to reach Hub")

        # Try to save
        print("Saving game...")
        # Now window.saveState might not be globally exposed, but main.js should bind it
        # or we might need to check if saveGameState is available on window
        page.evaluate("window.saveGameState()")
        time.sleep(1)

        # Reload to test persistence
        print("Reloading...")
        page.reload()
        time.sleep(2)
        page.screenshot(path="verification/3_reloaded.png")

        # Check if state loaded
        loaded_season = page.evaluate("window.state?.league?.year")
        print(f"Loaded season year: {loaded_season}")

        browser.close()

if __name__ == "__main__":
    run()
