// error-boundary.js - Global Error Handling for Vanilla JS

// Initialize error log
window._errorLog = window._errorLog || [];

export function initErrorBoundary() {
    window.addEventListener('error', (event) => {
        handleGlobalError(event.error || event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
        handleGlobalError(event.reason);
    });
}

function handleGlobalError(error) {
    console.error('Global Error Caught:', error);

    // Log to internal memory for Diagnostics
    if (window._errorLog) {
        window._errorLog.unshift({
            timestamp: new Date().toISOString(),
            message: error ? error.toString() : 'Unknown Error',
            stack: error && error.stack ? error.stack : null
        });
        // Keep log size manageable
        if (window._errorLog.length > 50) window._errorLog.pop();
    }

    // Update App Health Indicator if it exists
    const healthIndicator = document.getElementById('appHealthIndicator');
    if (healthIndicator) {
        healthIndicator.className = 'health-error';
        healthIndicator.title = 'Errors detected (Click for Diagnostics)';
    }

    // Prevent multiple modals
    if (document.getElementById('error-boundary-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'error-boundary-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        color: white;
        font-family: sans-serif;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: #1f2937;
        padding: 2rem;
        border-radius: 8px;
        max-width: 600px;
        width: 90%;
        border: 1px solid #dc2626;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
    `;

    const title = document.createElement('h2');
    title.textContent = '😕 Something went wrong';
    title.style.cssText = 'color: #ef4444; margin-top: 0;';

    const message = document.createElement('p');
    message.textContent = 'An unexpected error occurred. You may need to refresh the page.';

    const details = document.createElement('details');
    details.style.cssText = 'margin: 1rem 0; background: #111827; padding: 1rem; border-radius: 4px; overflow: auto; max-height: 200px; white-space: pre-wrap; font-family: monospace; font-size: 0.9em;';
    const summary = document.createElement('summary');
    summary.textContent = 'Error Details';
    summary.style.cursor = 'pointer';
    summary.style.marginBottom = '0.5rem';

    details.appendChild(summary);
    details.appendChild(document.createTextNode(error ? error.toString() : 'Unknown Error'));
    if (error && error.stack) {
        details.appendChild(document.createElement('br'));
        details.appendChild(document.createTextNode(error.stack));
    }

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 1rem; flex-wrap: wrap;';

    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = 'Reload Page';
    reloadBtn.style.cssText = 'background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: bold;';
    reloadBtn.onclick = () => window.location.reload();

    const homeBtn = document.createElement('button');
    homeBtn.textContent = 'Return to Hub';
    homeBtn.style.cssText = 'background: #4b5563; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;';
    homeBtn.onclick = () => {
        window.location.hash = '#/hub';
        window.location.reload(); // Safer to reload
    };

    const diagnosticsBtn = document.createElement('button');
    diagnosticsBtn.textContent = 'Diagnostics';
    diagnosticsBtn.style.cssText = 'background: #d97706; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;';
    diagnosticsBtn.onclick = () => {
        modal.remove();
        window.location.hash = '#/diagnostics';
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Dismiss (Risk)';
    closeBtn.style.cssText = 'background: transparent; border: 1px solid #4b5563; color: #9ca3af; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;';
    closeBtn.onclick = () => modal.remove();

    btnContainer.appendChild(closeBtn);
    btnContainer.appendChild(diagnosticsBtn);
    btnContainer.appendChild(homeBtn);
    btnContainer.appendChild(reloadBtn);

    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(details);
    content.appendChild(btnContainer);
    modal.appendChild(content);

    document.body.appendChild(modal);
}
