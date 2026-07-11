const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
const memory = () => {
  const m = globalThis.process?.memoryUsage?.();
  return m ? { rssMb: m.rss / 1048576, heapUsedMb: m.heapUsed / 1048576 } : { rssMb: null, heapUsedMb: null };
};
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export class OffseasonProfiler {
  constructor() { this.reset(); this.enabled = false; }
  reset(meta = {}) {
    this.meta = { ...meta };
    this.t0 = now();
    this.stack = [];
    this.records = [];
    this.aggregates = new Map();
    this.iterationSeries = [];
    this.persistence = { reads: 0, writes: 0, flushes: 0, totalMs: 0 };
    this.memoryCheckpoints = [];
    this.activeStage = null;
    this.completed = false;
    this.peakMemoryMb = 0;
  }
  enable(meta = {}) { this.enabled = true; this.reset(meta); this.enabled = true; this.checkpoint('profiler-enabled'); }
  disable() { this.enabled = false; }
  isEnabled() { return this.enabled === true || globalThis.__OFFSEASON_PROFILE_ENABLED__ === true; }
  start(name, data = {}) {
    if (!this.isEnabled()) return null;
    const mem = memory();
    this.peakMemoryMb = Math.max(this.peakMemoryMb, finite(mem.rssMb));
    const token = { name, parent: this.stack.at(-1)?.name ?? null, start: now(), data, memBefore: mem };
    this.stack.push(token); this.activeStage = name; return token;
  }
  end(token, data = {}) {
    if (!token || !this.isEnabled()) return null;
    const end = now(); const memAfter = memory();
    this.peakMemoryMb = Math.max(this.peakMemoryMb, finite(memAfter.rssMb));
    const idx = this.stack.lastIndexOf(token); if (idx >= 0) this.stack.splice(idx, 1);
    this.activeStage = this.stack.at(-1)?.name ?? null;
    const durationMs = Math.max(0, end - token.start);
    const rec = { name: token.name, parent: token.parent, startMs: token.start - this.t0, endMs: end - this.t0, durationMs, ...token.data, ...data, memoryBefore: token.memBefore, memoryAfter: memAfter };
    this.records.push(rec);
    const agg = this.aggregates.get(token.name) ?? { name: token.name, parent: token.parent, calls: 0, totalMs: 0, minMs: Infinity, maxMs: 0, items: 0, teams: 0, players: 0, prospects: 0, picks: 0, offers: 0 };
    agg.calls += 1; agg.totalMs += durationMs; agg.minMs = Math.min(agg.minMs, durationMs); agg.maxMs = Math.max(agg.maxMs, durationMs);
    for (const key of ['items','teams','players','prospects','picks','offers']) agg[key] += finite(rec[key]);
    this.aggregates.set(token.name, agg);
    if (String(token.name).includes('persistence') || String(token.name).includes('flushDirty')) { this.persistence.flushes += 1; this.persistence.writes += finite(rec.writes, 1); this.persistence.totalMs += durationMs; }
    return rec;
  }
  measure(name, data, fn) { const t = this.start(name, data); try { const r = fn(); if (r?.then) return r.then((v)=>{this.end(t);return v;},(e)=>{this.end(t,{error:e?.message});throw e;}); this.end(t); return r; } catch(e){ this.end(t,{error:e?.message}); throw e; } }
  count(name, data = {}) { if (!this.isEnabled()) return; const t = this.start(name, data); this.end(t, data); }
  addIteration(row) { if (!this.isEnabled()) return; this.iterationSeries.push({ index: this.iterationSeries.length, atMs: now() - this.t0, ...row }); }
  checkpoint(name, data = {}) { if (!this.isEnabled()) return; const mem = memory(); this.peakMemoryMb = Math.max(this.peakMemoryMb, finite(mem.rssMb)); this.memoryCheckpoints.push({ name, atMs: now() - this.t0, ...mem, ...data }); }
  report(extra = {}) {
    const runtimeMs = now() - this.t0;
    const stages = [...this.aggregates.values()].map(a => ({ ...a, minMs: a.minMs === Infinity ? 0 : a.minMs, avgMs: a.calls ? a.totalMs / a.calls : 0, share: runtimeMs ? a.totalMs / runtimeMs : 0 })).sort((a,b)=> b.totalMs-a.totalMs || a.name.localeCompare(b.name));
    const clean = (obj) => JSON.parse(JSON.stringify(obj, (_k,v)=> Number.isNaN(v)||v===Infinity||v===-Infinity ? null : v));
    return clean({ profileVersion:'1.0.0', ...this.meta, ...extra, runtimeMs, peakMemoryMb: Math.round(this.peakMemoryMb), activeStage: this.activeStage, firstIncompleteStage: extra.completed ? null : this.activeStage, stages, hotspots: stages.slice(0,10), iterationSeries: this.iterationSeries, persistence: this.persistence, memoryCheckpoints: this.memoryCheckpoints, records: this.records.slice(-200) });
  }
}
export const offseasonProfiler = new OffseasonProfiler();
export function getOffseasonProfiler(){ return offseasonProfiler; }
