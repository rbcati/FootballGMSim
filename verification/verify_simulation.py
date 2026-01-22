from playwright.sync_api import sync_playwright

def verify_simulation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/index.html")

        try:
            page.wait_for_selector("#nav-sidebar", timeout=5000)
        except:
            print("Timeout waiting for page load")
            browser.close()
            return

        result = page.evaluate("""() => {
            try {
                if (typeof window.simulateWeek !== 'function') return { error: 'window.simulateWeek not found' };
                if (typeof window.simGameStats !== 'function') return { error: 'window.simGameStats not found' };
                return { success: true };
            } catch (e) {
                return { error: e.toString() };
            }
        }""")

        print("Simulation verification:", result)
        browser.close()

if __name__ == "__main__":
    verify_simulation()
