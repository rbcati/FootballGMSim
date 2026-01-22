from playwright.sync_api import sync_playwright

def check_console():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append(msg.text))

        page.goto("http://localhost:8000")

        # Wait a bit for modules to load
        page.wait_for_timeout(2000)

        # Check logs
        success = True
        required_logs = [
            "✅ Utils module loaded correctly.",
            "✅ Constants module loaded correctly.",
            "✅ window.Utils is defined.",
            "✅ window.Constants is defined.",
            "✅ window.Constants.TEAMS_REAL is present (teams.js integration works).",
            "Module Verification Complete."
        ]

        for req in required_logs:
            if req not in console_logs:
                print(f"MISSING LOG: {req}")
                success = False
            else:
                print(f"FOUND LOG: {req}")

        if success:
            print("ALL VERIFICATIONS PASSED")
        else:
            print("VERIFICATION FAILED")
            print("All logs:")
            for log in console_logs:
                print(log)

        browser.close()

if __name__ == "__main__":
    check_console()
