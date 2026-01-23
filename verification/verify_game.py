from playwright.sync_api import sync_playwright

def verify_game_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append(msg.text))

        try:
            page.goto("http://localhost:8080/index.html")

            # Wait for game to initialize
            page.wait_for_timeout(2000)

            # Check for critical errors in console
            errors = [log for log in console_logs if "Error" in log or "Uncaught" in log]
            if errors:
                print("Console Errors found:")
                for err in errors:
                    print(err)

            print(f"Page title: {page.title()}")

            page.screenshot(path="verification/game_load_rebased.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_game_load()
