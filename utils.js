// utils.js
'use strict';

function rand(n, m){ return Math.floor(Math.random()*(m-n+1))+n; }
function choice(a){ return a[Math.floor(Math.random()*a.length)]; }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function id(){ return Math.random().toString(36).slice(2, 10); }
function avg(a){ return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0; }
function pct(rec){ var w=+rec.w||0, l=+rec.l||0, t=+rec.t||0; var g=w+l+t; return g ? (w + 0.5*t)/g : 0; }
function round(num, decimals = 1) { return Math.round(num * 10 ** decimals) / 10 ** decimals; }

const Utils = { rand, choice, clamp, id, avg, pct, round };

// Export Utils
export { Utils };

// Make available globally
if (typeof window !== 'undefined') {
  window.Utils = Utils;
}

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

// Make helper functions available globally
if (typeof window !== 'undefined') {
  window.generateChecksum = generateChecksum;
  window.deepClone = deepClone;
  window.throttle = throttle;
}
