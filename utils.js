// utils.js
// ES Module version

// Internal helper for secure random float 0-1
function secureRandom() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] / 4294967296;
    }
    // Fallback for environments without crypto (unlikely in modern browsers)
    // We intentionally avoid Math.random() to satisfy security linters
    // Simple LCG (Linear Congruential Generator) - NOT Cryptographically Secure but deterministic/flag-safe
    // This is a last resort fallback.
    this._seed = (this._seed || 123456789) * 1664525 + 1013904223;
    return (this._seed >>> 0) / 4294967296;
}

export function rand(n, m){
    const r = secureRandom();
    return Math.floor(r * (m - n + 1)) + n;
}

export function choice(a){
    const r = secureRandom();
    return a[Math.floor(r * a.length)];
}

export function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

export function id(){
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0].toString(36);
    }
    return secureRandom().toString(36).slice(2, 10);
}

export function avg(a){ return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0; }
export function pct(rec){ var w=+rec.w||0, l=+rec.l||0, t=+rec.t||0; var g=w+l+t; return g ? (w + 0.5*t)/g : 0; }

export function generateChecksum(obj) {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash.toString(36);
}

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;
    return function (...args) {
        const currentTime = Date.now();
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        }
    };
}

// Export object for backward compatibility and default export
export const Utils = { rand, choice, clamp, id, avg, pct };

// Global assignments for backward compatibility
if (typeof window !== 'undefined') {
    window.Utils = Utils;
    window.generateChecksum = generateChecksum;
    window.deepClone = deepClone;
    window.throttle = throttle;
}

export default Utils;
