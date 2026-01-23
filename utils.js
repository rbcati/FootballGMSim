// utils.js
// ES Module version

export function rand(n, m){ return Math.floor(Math.random()*(m-n+1))+n; }
export function choice(a){ return a[Math.floor(Math.random()*a.length)]; }
export function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
export function id(){
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0].toString(36);
    }
    return Math.random().toString(36).slice(2, 10);
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
