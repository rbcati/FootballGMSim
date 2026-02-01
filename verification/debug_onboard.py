from playwright.sync_api import sync_playwright

def verify_visuals():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"ERROR: {err}"))

        page.goto("http://localhost:8080/index.html")
        page.wait_for_load_state("networkidle")

        if page.is_visible('#onboardModal'):
            print("Clicking Start...")
            # Use evaluate to click to be sure
            page.evaluate("document.querySelector('#onboardStart').click()")

            # Wait for hub
            try:
                page.wait_for_selector('#hub', state='visible', timeout=10000)
                print("Hub visible")
            except:
                print("Hub timeout")

        # Check state immediately
        print("Checking state...")
        page.evaluate("""
            console.log('State League:', window.state.league ? 'Exists' : 'Null');
            console.log('State Onboarded:', window.state.onboarded);
        """)

        browser.close()

if __name__ == "__main__":
    verify_visuals()
