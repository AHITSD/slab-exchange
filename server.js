// Slab Exchange price server.
// Serves the app, collects prices from every source on its own schedule, blends them,
// and pushes any change to every open browser straight away (Server-Sent Events).
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCES} from './lib/sources.js';
import {loadState, saveState, mergeQuotes, reblend, publicData} from './lib/engine.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const SEED = path.join(ROOT, 'seed', 'seed.json');
const TICK_SECONDS = Math.max(15, Number(process.env.CHECK_EVERY_SECONDS) || 60);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SCALE = Math.max(0.01, Number(process.env.SCHEDULE_SCALE) || 1); // tests run the schedule faster

const state = await loadState(DATA_DIR, SEED);
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- collecting ---------- */
let running = false;
async function collect(force) {
  if (running) return [];
  running = true;
  const now = Date.now();
  try {
    for (const src of SOURCES) {
      const st = state.sources[src.name] = state.sources[src.name] || {label: src.label};
      st.label = src.label; st.enabled = src.enabled();
      if (!st.enabled) continue;
      const due = !st.lastRun || now - Date.parse(st.lastRun) >= src.everyMin * 60000 * SCALE;
      if (!due && !force) continue;
      st.lastRun = new Date().toISOString();
      try {
        const r = await src.run(Date.now(), state);
        if (r.fx) state.fx = r.fx;
        mergeQuotes(state, r.cards);
        st.lastOk = new Date().toISOString(); st.covered = r.covered || 0;
        st.error = r.errors && r.errors.length && !r.covered ? r.errors[0] : null;
        st.errors = (r.errors || []).slice(0, 20);
        log(`${src.name}: ${r.covered || 0} cards${r.errors && r.errors.length ? `, ${r.errors.length} problems: ${r.errors.slice(0, 3).join(' | ')}` : ''}`);
      } catch (e) { st.error = e.message; log(`${src.name} failed: ${e.message}`); }
    }
    const {changed, touched} = reblend(state, Date.now());
    state.checkedAt = new Date().toISOString();
    await saveState(DATA_DIR, state);
    broadcast('status', statusBody());
    if (touched.length) broadcast('prices', publicData(state, touched));
    if (changed.length) log(`price change: ${changed.join(', ')}`);
    return changed;
  } finally { running = false; }
}
const statusBody = () => { const d = publicData(state, []); return {asOf: d.asOf, checkedAt: d.checkedAt, fx: d.fx, sources: d.sources}; };

/* ---------- live push ---------- */
const clients = new Set();
let eventId = 0;
function send(res, event, data) { res.write(`id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function broadcast(event, data) { for (const res of clients) send(res, event, data); }
setInterval(() => { for (const res of clients) res.write(': keep-alive\n\n'); }, 25000).unref();

/* ---------- web ---------- */
const files = {
  '/': ['public/index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/index.html': ['public/index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/favicon.svg': ['public/favicon.svg', 'image/svg+xml', 'public, max-age=86400'],
  '/robots.txt': ['public/robots.txt', 'text/plain; charset=utf-8', 'public, max-age=86400']
};
const cache = new Map();
async function fileBody(rel) {
  if (!cache.has(rel) || process.env.NODE_ENV === 'development') { const b = await readFile(path.join(ROOT, rel)); cache.set(rel, {raw: b, gz: gzipSync(b)}); }
  return cache.get(rel);
}
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'"
};
function reply(req, res, status, type, body, cacheCtl, extra) {
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 1024;
  const out = gz ? gzipSync(body) : body;
  res.writeHead(status, Object.assign({'Content-Type': type, 'Cache-Control': cacheCtl || 'no-store', 'Vary': 'Accept-Encoding'}, gz ? {'Content-Encoding': 'gzip'} : {}, SECURITY, extra || {}));
  res.end(req.method === 'HEAD' ? undefined : out);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/stream') {
      res.writeHead(200, Object.assign({'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'}, SECURITY));
      res.write('retry: 5000\n\n');
      clients.add(res);
      send(res, 'prices', publicData(state));
      send(res, 'status', statusBody());
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/prices.js') {
      const body = Buffer.from('window.SLAB_DATA = ' + JSON.stringify(publicData(state)) + ';\n');
      return reply(req, res, 200, 'application/javascript; charset=utf-8', body);
    }
    if (p === '/api/prices') return reply(req, res, 200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(publicData(state))));
    if (p === '/api/status' || p === '/healthz') {
      const s = Object.fromEntries(Object.entries(state.sources).map(([k, v]) => [k, {label: v.label, enabled: v.enabled !== false, lastRun: v.lastRun || null, lastOk: v.lastOk || null, covered: v.covered || 0, error: v.error || null, problems: v.errors || []}]));
      return reply(req, res, 200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify({ok: true, asOf: state.asOf, checkedAt: state.checkedAt, viewers: clients.size, sources: s, matched: state.resolved || {}}, null, 2)));
    }
    if (p === '/api/collect' && req.method === 'POST') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return reply(req, res, 403, 'application/json', Buffer.from('{"error":"forbidden"}'));
      const ids = await collect(true);
      return reply(req, res, 200, 'application/json', Buffer.from(JSON.stringify({changed: ids})));
    }
    const f = files[p];
    if (f && (req.method === 'GET' || req.method === 'HEAD')) {
      const b = await fileBody(f[0]);
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, Object.assign({'Content-Type': f[1], 'Cache-Control': f[2], 'Vary': 'Accept-Encoding'}, gz ? {'Content-Encoding': 'gzip'} : {}, SECURITY));
      return res.end(req.method === 'HEAD' ? undefined : gz ? b.gz : b.raw);
    }
    reply(req, res, 404, 'text/plain; charset=utf-8', Buffer.from('Not found'));
  } catch (e) {
    log('request failed:', e.message);
    if (!res.headersSent) reply(req, res, 500, 'text/plain; charset=utf-8', Buffer.from('Something went wrong'));
    else res.end();
  }
});

server.listen(PORT, () => {
  log(`Slab Exchange running on port ${PORT}. Checking sources every ${TICK_SECONDS}s.`);
  if (!process.env.PRICECHARTING_TOKEN) log('No PRICECHARTING_TOKEN set: graded and sports prices stay at the 10 Oct 2026 snapshot.');
  collect(false).catch(e => log('collect failed:', e.message));
  setInterval(() => collect(false).catch(e => log('collect failed:', e.message)), TICK_SECONDS * 1000);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { log('shutting down'); for (const r of clients) r.end(); await saveState(DATA_DIR, state); process.exit(0); });
