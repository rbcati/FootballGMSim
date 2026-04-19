# Feature Architecture: "Click to Update" System

This document outlines the architecture for a Service Worker-based update system that notifies users of new versions, allows them to apply updates instantly, and presents a changelog upon reload.

## 1. Service Worker & Version Control Strategy

### A. Versioning Source of Truth
We will maintain a `version.json` file in the root directory. This file is fetched by the client to detect updates without downloading the entire application bundle.

**File:** `version.json`
```json
{
  "version": "1.2.0",
  "build": 2023102501,
  "changelog_url": "daily_changelog.md"
}
```

### B. Service Worker (`sw.js`)
The Service Worker caches assets for offline use. It uses a "Stale-While-Revalidate" or "Network First" strategy for the `version.json` file to ensure it always knows about the latest version.

**Key Logic:**
1.  **Install Phase:** Cache core assets.
2.  **Activate Phase:** Clean up old caches.
3.  **Fetch Phase:** Serve assets.
4.  **Message Listener:** Listen for `SKIP_WAITING` signal to force activation of the new worker.

## 2. Update Detection Flow

The main application (`main.js`) initiates the check.

1.  **Poll for Updates:**
    *   On `window.load`.
    *   On `visibilitychange` (when user returns to the tab).
    *   Interval (e.g., every 60 minutes).

2.  **Comparison Logic:**
    *   Fetch `/version.json?t=${Date.now()}` (bypass browser cache).
    *   Compare `fetchedVersion` vs `window.CURRENT_VERSION` (injected via build or constant).
    *   **Or**, rely on the Service Worker's standard `updatefound` event.

### Recommended Flow (Standard SW Lifecycle):
Instead of manual polling, we rely on the browser's Service Worker registration:

```javascript
// main.js registration
if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/sw.js');

    // Trigger update check manually if needed
    reg.update();

    reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New update available and installed!
                showUpdateNotification();
            }
        });
    });
}
```

## 3. User Prompt (UI)

When an update is "installed" (waiting in the background):

1.  **Display Notification:** Show a non-intrusive Toast or Banner at the bottom of the screen.
    *   *Text:* "A new update is available!"
    *   *Button:* "Refresh to Update"

2.  **UI Logic:**
    ```javascript
    function showUpdateNotification() {
        const toast = document.createElement('div');
        toast.className = 'update-toast';
        toast.innerHTML = `
            <span>New version available!</span>
            <button id="btnReload">Update Now</button>
        `;
        document.body.appendChild(toast);

        document.getElementById('btnReload').onclick = () => {
             // Trigger the update
             invokeUpdate();
        };
    }
    ```

## 4. Triggering the Update (Skip Waiting)

When the user clicks "Update Now":

1.  **Post Message:** Send a message to the waiting Service Worker telling it to take control immediately.
    ```javascript
    function invokeUpdate() {
        if (navigator.serviceWorker.getRegistration().waiting) {
            navigator.serviceWorker.getRegistration().waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }
    ```

2.  **Service Worker Handling (`sw.js`):**
    ```javascript
    self.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SKIP_WAITING') {
            self.skipWaiting();
        }
    });
    ```

3.  **Reload Page:**
    Listen for the `controllerchange` event in `main.js` to reload the page automatically once the new SW takes over.
    ```javascript
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            window.location.reload();
            refreshing = true;
        }
    });
    ```

## 5. Post-Update Changelog

How to show the user what changed *after* the reload:

1.  **Storage Flag:** Before reloading (or upon detecting a version mismatch before update), store the "previous" version in `localStorage`.
    *   Actually, easier: On app load, check `localStorage.getItem('last_viewed_version')`.

2.  **Logic on Load (`main.js`):**
    ```javascript
    const CURRENT_VERSION = "1.2.0"; // From build/constants
    const lastVersion = localStorage.getItem('last_viewed_version');

    if (lastVersion && lastVersion !== CURRENT_VERSION) {
        // Version changed!
        showChangelogModal();
    }

    // Update the flag
    localStorage.setItem('last_viewed_version', CURRENT_VERSION);
    ```

3.  **Display Changelog:**
    *   Fetch `changelog.json` or parse `daily_changelog.md`.
    *   Filter entries where `entry.version > lastVersion`.
    *   Render in a Modal.

## Summary Checklist

1.  [ ] **`version.json`**: Create file in root.
2.  [ ] **`sw.js`**: Implement `install`, `activate`, `fetch`, and `message` (SKIP_WAITING) listeners.
3.  [ ] **`main.js`**: Register SW, listen for `updatefound`, render UI Toast.
4.  [ ] **`main.js`**: Handle "Click" -> `postMessage('SKIP_WAITING')` -> `location.reload()`.
5.  [ ] **`main.js`**: On load, compare `CURRENT_VERSION` with `localStorage`, show Changelog modal if different.
