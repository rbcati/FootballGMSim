from playwright.sync_api import sync_playwright
import time

def verify_player_js():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Subscribe to console messages
        page.on("console", lambda msg: print(f"Console {msg.type}: {msg.text}"))

        # Navigate to the app
        print("Navigating to http://localhost:8000/index.html")
        page.goto("http://localhost:8000/index.html")

        # Wait for page load (check for a key element)
        try:
            page.wait_for_selector("#nav-sidebar", timeout=10000)
            print("Page loaded.")
        except:
            print("Timeout waiting for #nav-sidebar")
            page.screenshot(path="verification/failed_load.png")
            browser.close()
            return

        # Verify makePlayer works
        print("Verifying makePlayer...")
        result = page.evaluate("""() => {
            try {
                if (typeof window.makePlayer !== 'function') return { error: 'window.makePlayer not found' };

                // Also check if Utils and Constants are available globally (legacy check)
                // But importantly, check if makePlayer can create a player using them internally
                const p = window.makePlayer('QB');

                if (!p) return { error: 'makePlayer returned null' };
                if (p.pos !== 'QB') return { error: 'Player pos mismatch' };
                if (!p.id) return { error: 'Player id missing' };

                return { success: true, player: { name: p.name, pos: p.pos, ovr: p.ovr } };
            } catch (e) {
                return { error: e.toString(), stack: e.stack };
            }
        }""")

        print("makePlayer result:", result)

        if result.get("error"):
            print("Verification FAILED:", result["error"])
            if "stack" in result:
                print("Stack:", result["stack"])
        else:
            print("Verification PASSED")

        # Take screenshot
        page.screenshot(path="verification/player_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_player_js()
