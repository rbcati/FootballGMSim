import subprocess
import time
import sys
from playwright.sync_api import sync_playwright

def run_verification():
    # Start HTTP Server
    print("Starting HTTP Server on port 8001...")
    server_process = subprocess.Popen([sys.executable, "-m", "http.server", "8001"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2) # Wait for start

    try:
        with sync_playwright() as p:
            print("Launching Browser...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            url = "http://localhost:8001/test-football-db.html"
            print(f"Navigating to {url}...")
            page.goto(url)

            # Wait for result
            try:
                page.wait_for_selector("#result", timeout=10000)
            except:
                print("Timeout waiting for #result element")
                return False

            # Poll for result change from "Running..."
            for _ in range(10):
                text = page.text_content("#result")
                if "SUCCESS" in text:
                    print("Verification PASSED: FootballDB works correctly.")
                    return True
                if "FAILURE" in text:
                    print(f"Verification FAILED: {text}")
                    return False
                time.sleep(1)

            print("Verification TIMEOUT: Result remained 'Running...' or did not update.")
            return False

            browser.close()
    except Exception as e:
        print(f"An error occurred: {e}")
        return False
    finally:
        print("Stopping HTTP Server...")
        server_process.terminate()

if __name__ == "__main__":
    success = run_verification()
    if not success:
        sys.exit(1)
