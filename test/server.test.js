// Starts the real server against recorded source responses and checks the full path:
// sources -> blend -> prices.js -> live push to an open browser connection.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixtureName} from '../lib/net.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const work = mkdtempSync(path.join(tmpdir(), 'slab-'));
const fixtures = path.join(work, 'fixtures');
cpSync(path.join(ROOT, 'test', 'fixtures'), fixtures, {recursive: true});

function start() {
  const p = spawn(process.execPath, ['server.js'], {cwd: ROOT, env: Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: path.join(work, 'data'), FIXTURES_DIR: fixtures, ADMIN_TOKEN: 'test-admin',
    PRICECHARTING_TOKEN: 'x', PC_GAP_MS: '0', CHECK_EVERY_SECONDS: '600'
  }), stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  p.logs = () => out;
  return p;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await wait(100); } throw new Error('timed out'); }
async function prices() { const t = await (await fetch(`${BASE}/prices.js`)).text(); return JSON.parse(t.replace(/^window\.SLAB_DATA = /, '').replace(/;\s*$/, '')); }

const proc = start();
test.after(() => { proc.kill('SIGTERM'); rmSync(work, {recursive: true, force: true}); });

test('serves the app, prices and status', async () => {
  await until(async () => (await fetch(`${BASE}/healthz`)).ok);
  await until(async () => (await prices()).checkedAt);
  const page = await fetch(`${BASE}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Slab Exchange/);
  const d = await prices();
  assert.equal(Object.keys(d.cards).length, 16);
  assert.ok(d.fx.EUR > 0);
});

test('blends fresh sources and leaves out stale ones', async () => {
  const d = await prices();
  const lug = d.cards.LUGST;
  assert.equal(lug.conf.R.level, 'medium');
  assert.ok(lug.prices.R > 439 && lug.prices.R < 506, `Lugia ${lug.prices.R}`);
  assert.equal(lug.quotes.R.find(q => q.src === 'cardmarket').why, 'stale');
  const umb = d.cards.UMBEV;
  assert.equal(umb.quotes.R.find(q => q.src === 'tcgplayer').why, 'stale');
  assert.equal(umb.prices['10'], 3899, 'PriceCharting PSA 10 from the live API replaces the snapshot');
  assert.equal(d.cards.MJF86.prices.R, 4654, 'cards with no live source keep the snapshot');
  const st = await (await fetch(`${BASE}/api/status`)).json();
  assert.equal(st.matched.UMBEV.id, '9001');
  assert.ok(st.sources.pricecharting.problems.length > 0, 'cards without a match are reported');
});

test('a price change reaches an open browser connection straight away', async () => {
  const ctl = new AbortController();
  const res = await fetch(`${BASE}/api/stream`, {signal: ctl.signal});
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const events = [];
  (async () => { try { for (;;) { const {value, done} = await reader.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /event: (\w+)/.exec(chunk), data = /data: (.*)/.exec(chunk); if (ev && data) events.push({event: ev[1], data: JSON.parse(data[1])}); } } } catch (e) {} })();
  await until(() => events.some(e => e.event === 'prices'));
  assert.equal(Object.keys(events.find(e => e.event === 'prices').data.cards).length, 16, 'full snapshot on connect');

  const f = path.join(fixtures, fixtureName('https://api.pokemontcg.io/v2/cards/sv3-223'));
  const j = JSON.parse(readFileSync(f, 'utf8')); j.data.tcgplayer.prices.holofoil.market = 120; writeFileSync(f, JSON.stringify(j));
  const before = events.length;
  const r = await fetch(`${BASE}/api/collect`, {method: 'POST', headers: {authorization: 'Bearer test-admin'}});
  assert.deepEqual((await r.json()).changed, ['CZDOF']);
  const ev = await until(() => events.slice(before).find(e => e.event === 'prices'));
  assert.ok(Object.keys(ev.data.cards).includes('CZDOF'));
  assert.ok(ev.data.cards.CZDOF.prices.R > 100);
  assert.ok(ev.data.history.CZDOF.length >= 2, 'history grows');
  ctl.abort();
});

test('collecting without the admin token is refused', async () => {
  const r = await fetch(`${BASE}/api/collect`, {method: 'POST'});
  assert.equal(r.status, 403);
});
