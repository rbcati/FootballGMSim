from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        try:
            page.goto("http://localhost:8000")
            page.wait_for_selector("#onboardModal", state="visible")

            page.wait_for_function("document.getElementById('onboardTeam').options.length > 0")

            options = page.evaluate("""() => {
                const select = document.getElementById('onboardTeam');
                return Array.from(select.options).map(o => ({text: o.text, value: o.value}));
            }""")

            if len(options) > 1:
                # Select index 1 to avoid '0' bug
                val = options[1]['value']
                page.select_option("#onboardTeam", val)
                print(f"Selected option value: {val}")

                # Click Start Season
                page.click("#onboardStart")

                page.wait_for_selector("#onboardModal", state="hidden", timeout=60000)
                page.wait_for_selector("#hub", state="visible")

                page.evaluate("location.hash = '#/roster'")
                page.wait_for_selector("#rosterTable")
                page.wait_for_timeout(2000)

                page.screenshot(path="verification/salary_verification.png", full_page=True)
                print("Screenshot taken")
            else:
                print("Not enough options")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
