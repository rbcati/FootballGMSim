// logger.js
// Captures console logs, errors, and network requests for the Diagnostics panel.
// Optimized for performance and gated behind debug mode.

const MAX_LOGS = 200;
const MAX_ERRORS = 50;
const MAX_NETWORK = 20;

// Buffers
if (!window._logBuffer) window._logBuffer = [];
if (!window._errorLog) window._errorLog = [];
if (!window._networkLog) window._networkLog = [];

let isInitialized = false;

// Safe stringifier that avoids circular references and massive strings
function safeStringify(obj, depth = 0) {
    if (depth > 2) return '[Object]';
    try {
        if (obj === null) return 'null';
        if (typeof obj === 'undefined') return 'undefined';
        if (typeof obj !== 'object') return String(obj);

        // Simple fast serialization for plain objects
        const str = JSON.stringify(obj, (key, value) => {
             if (depth > 0 && typeof value === 'object' && value !== null) {
                 return '[Object]'; // Truncate nested objects for performance
             }
             return value;
        });
        return str.length > 500 ? str.substring(0, 500) + '...' : str;
    } catch (e) {
        return String(obj);
    }
}

function captureLog(level, args) {
    if (!isInitialized) return;

    try {
        const message = args.map(arg => safeStringify(arg)).join(' ');
        const route = window.location.hash || '/';

        window._logBuffer.unshift({
            timestamp: new Date().toISOString(),
            level: level,
            route: route,
            message: message
        });

        if (window._logBuffer.length > MAX_LOGS) {
            window._logBuffer.pop();
        }
    } catch (e) {
        // Fail silently to avoid infinite loops
    }
}

function initLogger() {
    // Check for debug flag in URL or LocalStorage
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === '1';
    const settingsDebug = localStorage.getItem('debug_mode') === 'true';

    if (!debugMode && !settingsDebug) {
        return; // Do not initialize logger in production/default
    }

    if (isInitialized) return;
    isInitialized = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Override console methods
    console.log = function(...args) {
        captureLog('info', args);
        originalLog.apply(console, args);
    };

    console.warn = function(...args) {
        captureLog('warn', args);
        originalWarn.apply(console, args);
    };

    console.error = function(...args) {
        captureLog('error', args);
        try {
             window._errorLog.unshift({
                timestamp: new Date().toISOString(),
                message: args.map(a => String(a)).join(' '),
                stack: new Error().stack
            });
            if (window._errorLog.length > MAX_ERRORS) window._errorLog.pop();
        } catch (e) {}

        originalError.apply(console, args);
    };

    // Capture global errors
    window.addEventListener('error', (event) => {
        captureLog('error', [event.message]);
    });

    window.addEventListener('unhandledrejection', (event) => {
        captureLog('error', ['Unhandled Rejection:', event.reason]);
    });

    // Network Monitoring (Fetch)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        if (!isInitialized) return originalFetch.apply(window, args);

        const startTime = performance.now();
        const url = args[0];
        const method = (args[1] && args[1].method) || 'GET';

        try {
            const response = await originalFetch.apply(window, args);
            const duration = Math.round(performance.now() - startTime);

            window._networkLog.unshift({
                timestamp: new Date().toISOString(),
                type: 'fetch',
                method: method,
                url: url,
                status: response.status,
                duration: duration
            });
            if (window._networkLog.length > MAX_NETWORK) window._networkLog.pop();

            return response;
        } catch (error) {
            const duration = Math.round(performance.now() - startTime);
            window._networkLog.unshift({
                timestamp: new Date().toISOString(),
                type: 'fetch',
                method: method,
                url: url,
                status: 'ERROR',
                duration: duration,
                error: error.message
            });
            if (window._networkLog.length > MAX_NETWORK) window._networkLog.pop();
            throw error;
        }
    };

    // Network Monitoring (XHR)
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        if (isInitialized) {
            this._method = method;
            this._url = url;
            this._startTime = performance.now();
        }
        originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        if (isInitialized && this._startTime) {
            this.addEventListener('load', () => {
                const duration = Math.round(performance.now() - this._startTime);
                window._networkLog.unshift({
                    timestamp: new Date().toISOString(),
                    type: 'xhr',
                    method: this._method,
                    url: this._url,
                    status: this.status,
                    duration: duration
                });
                if (window._networkLog.length > MAX_NETWORK) window._networkLog.pop();
            });

            this.addEventListener('error', () => {
                 const duration = Math.round(performance.now() - this._startTime);
                 window._networkLog.unshift({
                    timestamp: new Date().toISOString(),
                    type: 'xhr',
                    method: this._method,
                    url: this._url,
                    status: 'ERROR',
                    duration: duration
                });
                if (window._networkLog.length > MAX_NETWORK) window._networkLog.pop();
            });
        }
        originalSend.apply(this, arguments);
    };

    console.log('✅ Diagnostics Logger Initialized (Debug Mode Active)');
}

export function getLogger() {
    return {
        logs: window._logBuffer,
        errors: window._errorLog,
        network: window._networkLog,
        clear: () => {
            window._logBuffer = [];
            window._errorLog = [];
            window._networkLog = [];
        },
        isInitialized: isInitialized
    };
}

// Auto-init if imported, but checks flags internally
initLogger();
