// Keeps the latest quote from every source, blends them into one price per card and grade,
// records price history and works out which cards changed.
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {blend} from './blend.js';
import {CATALOG} from './catalog.js';

const GRADES = ['R', '7', '8', '9', '9.5', '10'];
const HISTORY_MAX = 1500;
const iso = t => new Date(t).toISOString();

export function seedState(seed) {
  const at = Date.parse(seed.asOf + 'T12:00:00Z');
  const s = {v: 1, asOf: iso(at), checkedAt: null, salesAsOf: seed.asOf, fx: seed.fx || null, cards: {}, raw: {}, history: {}, sources: {}, resolved: {}};
  for (const c of CATALOG) {
    const d = seed.cards[c.id]; if (!d) continue;
    const site = /sportscardspro/.test(d.url) ? 'SportsCardsPro' : 'PriceCharting';
    s.cards[c.id] = {url: d.url, site, sales: d.sales || [], prices: {}, conf: {}, quotes: {}, changedAt: iso(at)};
    s.raw[c.id] = {};
    for (const g of GRADES) {
      const p = d.prices[g]; if (!(p > 0)) continue;
      s.raw[c.id][g] = {pricecharting: {src: 'pricecharting', label: site, via: 'snapshot', kind: 'sold', price: p, cur: 'USD', at, url: d.url}};
      s.cards[c.id].prices[g] = p;
    }
    s.history[c.id] = [[iso(at), Object.assign({}, s.cards[c.id].prices)]];
  }
  return s;
}

export async function loadState(dir, seedFile) {
  const file = path.join(dir, 'state.json');
  try { const s = JSON.parse(await readFile(file, 'utf8')); if (s && s.v === 1 && s.cards) return s; } catch (e) {}
  const seed = JSON.parse(await readFile(seedFile, 'utf8'));
  return seedState(seed);
}

let saving = Promise.resolve();
export function saveState(dir, state) {
  saving = saving.then(async () => {
    await mkdir(dir, {recursive: true});
    const file = path.join(dir, 'state.json'), tmp = file + '.tmp';
    await writeFile(tmp, JSON.stringify(state));
    await rename(tmp, file);
  }).catch(e => console.error('save failed:', e.message));
  return saving;
}

/* merge a source's quotes into the raw table */
export function mergeQuotes(state, cards) {
  for (const [id, grades] of Object.entries(cards || {})) {
    if (!state.raw[id]) continue;
    for (const [g, list] of Object.entries(grades)) for (const q of [].concat(list)) (state.raw[id][g] = state.raw[id][g] || {})[q.src + (q.via && q.via !== 'snapshot' ? '|' + q.via : '')] = q;
  }
}

const toUSD = (q, fx) => q.cur === 'USD' ? q.price : q.cur === 'EUR' && fx && fx.EUR ? q.price / fx.EUR : q.cur === 'GBP' && fx && fx.GBP ? q.price / fx.GBP : null;

/* blend every card and grade; returns the ids whose price changed, and the ids whose sources changed */
export function reblend(state, now = Date.now()) {
  const changed = [], touched = [];
  for (const [id, grades] of Object.entries(state.raw)) {
    const card = state.cards[id]; let moved = false;
    const before = JSON.stringify([card.quotes, card.conf]);
    for (const [g, bySrc] of Object.entries(grades)) {
      const quotes = Object.values(bySrc).map(q => Object.assign({}, q, {usd: toUSD(q, state.fx)}));
      const b = blend(quotes, now);
      card.quotes[g] = b.quotes.map(q => ({src: q.src, label: q.label, via: q.via || null, kind: q.kind, price: q.price, cur: q.cur, usd: q.usd == null ? null : Math.round(q.usd * 100) / 100, at: q.at ? iso(q.at) : null, url: q.url || null, used: q.used, why: q.why, weight: q.weight || 0}));
      if (b.price == null) { card.conf[g] = {level: 'stale', n: 0, spread: null}; continue; }
      card.conf[g] = {level: b.level, n: b.n, spread: b.spread};
      if (Math.round((card.prices[g] || 0) * 100) !== Math.round(b.price * 100)) { card.prices[g] = b.price; moved = true; }
    }
    if (moved || JSON.stringify([card.quotes, card.conf]) !== before) touched.push(id);
    if (moved) {
      card.changedAt = iso(now); changed.push(id);
      const h = state.history[id] = state.history[id] || [];
      h.push([iso(now), Object.assign({}, card.prices)]);
      if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
    }
  }
  if (changed.length) state.asOf = iso(now);
  return {changed, touched};
}

/* what browsers get: everything for a full load, or only the changed cards for a live update */
export function publicData(state, ids) {
  const pick = ids || Object.keys(state.cards), cards = {}, history = {};
  for (const id of pick) {
    const c = state.cards[id]; if (!c) continue;
    cards[id] = {url: c.url, site: c.site, prices: c.prices, conf: c.conf, quotes: c.quotes, changedAt: c.changedAt};
    if (!ids) cards[id].sales = c.sales;
    history[id] = state.history[id] || [];
  }
  const sources = Object.fromEntries(Object.entries(state.sources).map(([k, s]) => [k, {label: s.label, lastOk: s.lastOk, lastRun: s.lastRun, ok: !s.error, covered: s.covered || 0, enabled: s.enabled !== false}]));
  return {asOf: state.asOf, checkedAt: state.checkedAt, salesAsOf: state.salesAsOf, fx: state.fx, live: true, sources, cards, history};
}
