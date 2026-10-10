// Price sources. Each one collects quotes for the cards it covers and returns them as
// {cards: {CARD_ID: {GRADE: [quote, ...]}}}. A source only runs when it is due, so it never asks
// for data more often than that source refreshes or allows.
import {getJSON, sleep} from './net.js';
import {CATALOG, GRADE_FIELDS} from './catalog.js';

const enc = encodeURIComponent;
const ymd = s => { const m = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 12) : null; };
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const PC_GAP = Number(process.env.PC_GAP_MS ?? 1100); // PriceCharting allows one call per second
const put = (cards, id, grade, q) => { const g = cards[id] = cards[id] || {}; (g[grade] = g[grade] || []).push(q); };

/* exchange rates: European Central Bank reference rates via Frankfurter */
export const fx = {
  name: 'fx', label: 'Exchange rates (European Central Bank)', everyMin: 360,
  enabled: () => true,
  async run() {
    const r = await getJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP');
    const EUR = num(r.rates && r.rates.EUR), GBP = num(r.rates && r.rates.GBP);
    if (!EUR || !GBP) throw new Error('rates missing from response');
    return {fx: {EUR, GBP, date: r.date || null}, covered: 0};
  }
};

/* Pokémon: TCGplayer and Cardmarket prices via the Pokémon TCG API */
export const pokemontcg = {
  name: 'pokemontcg', label: 'Pokémon TCG API (TCGplayer and Cardmarket)', everyMin: 60,
  enabled: () => true,
  async run() {
    const cards = {}, errors = [];
    const headers = process.env.POKEMONTCG_API_KEY ? {'X-Api-Key': process.env.POKEMONTCG_API_KEY} : {};
    for (const c of CATALOG.filter(c => c.ptcg)) {
      try {
        const d = (await getJSON(`https://api.pokemontcg.io/v2/cards/${enc(c.ptcg.id)}`, headers)).data || {};
        const tp = d.tcgplayer && d.tcgplayer.prices && d.tcgplayer.prices[c.ptcg.variant];
        const market = tp && num(tp.market);
        if (market) put(cards, c.id, 'R', {src: 'tcgplayer', label: 'TCGplayer', via: 'Pokémon TCG API', kind: 'market', price: market, cur: 'USD', at: ymd(d.tcgplayer.updatedAt), url: d.tcgplayer.url || null});
        const cm = d.cardmarket && d.cardmarket.prices;
        const eur = cm && (num(cm.avg7) || num(cm.trendPrice));
        if (eur) put(cards, c.id, 'R', {src: 'cardmarket', label: 'Cardmarket', via: 'Pokémon TCG API', kind: 'trend', price: eur, cur: 'EUR', at: ymd(d.cardmarket.updatedAt), url: d.cardmarket.url || null});
      } catch (e) { errors.push(`${c.id}: ${e.message}`); }
      await sleep(150);
    }
    return {cards, errors, covered: Object.keys(cards).length};
  }
};

/* Magic: TCGplayer and Cardmarket prices via Scryfall (Scryfall updates once a day) */
export const scryfall = {
  name: 'scryfall', label: 'Scryfall (TCGplayer and Cardmarket)', everyMin: 720,
  enabled: () => true,
  async run(now) {
    const cards = {}, errors = [];
    for (const c of CATALOG.filter(c => c.scry)) {
      try {
        const d = await getJSON(`https://api.scryfall.com/cards/named?exact=${enc(c.scry.name)}&set=${enc(c.scry.set)}`);
        const p = d.prices || {}, at = now;
        if (num(p.usd)) put(cards, c.id, 'R', {src: 'tcgplayer', label: 'TCGplayer', via: 'Scryfall', kind: 'market', price: num(p.usd), cur: 'USD', at, url: (d.purchase_uris && d.purchase_uris.tcgplayer) || d.scryfall_uri || null});
        if (num(p.eur)) put(cards, c.id, 'R', {src: 'cardmarket', label: 'Cardmarket', via: 'Scryfall', kind: 'trend', price: num(p.eur), cur: 'EUR', at, url: (d.purchase_uris && d.purchase_uris.cardmarket) || d.scryfall_uri || null});
      } catch (e) { errors.push(`${c.id}: ${e.message}`); }
      await sleep(120);
    }
    return {cards, errors, covered: Object.keys(cards).length};
  }
};

/* PriceCharting and SportsCardsPro: every grade, worked out from sold listings. Needs a paid token. */
const norm = s => decodeURIComponent(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '');
function pcParts(url) {
  const u = new URL(url), [, , cons, prod] = u.pathname.split('/');
  return {host: u.origin, cons, prod, q: `${decodeURIComponent(prod).replace(/-/g, ' ')} ${decodeURIComponent(cons).replace(/-/g, ' ')}`};
}
export const pricecharting = {
  name: 'pricecharting', label: 'PriceCharting and SportsCardsPro', everyMin: 60,
  enabled: () => !!process.env.PRICECHARTING_TOKEN,
  async run(now, state) {
    const t = process.env.PRICECHARTING_TOKEN, cards = {}, errors = [];
    state.resolved = state.resolved || {};
    for (const c of CATALOG.filter(c => c.pc)) {
      const p = pcParts(c.pc), site = /sportscardspro/.test(p.host) ? 'SportsCardsPro' : 'PriceCharting';
      try {
        let id = state.resolved[c.id] && state.resolved[c.id].id;
        if (!id) {
          const r = await getJSON(`${p.host}/api/products?t=${enc(t)}&q=${enc(p.q)}`);
          const list = Array.isArray(r.products) ? r.products : r.id ? [r] : [];
          const hit = list.find(x => norm(x['console-name']) === norm(p.cons) && norm(x['product-name']) === norm(p.prod));
          if (!hit) throw new Error(`no exact match for "${p.q}" (got ${list.slice(0, 3).map(x => `${x['product-name']} / ${x['console-name']}`).join('; ') || 'nothing'})`);
          id = String(hit.id); state.resolved[c.id] = {id, name: `${hit['product-name']} / ${hit['console-name']}`};
          await sleep(PC_GAP);
        }
        const d = await getJSON(`${p.host}/api/product?t=${enc(t)}&id=${enc(id)}`);
        if (d.status && d.status !== 'success') throw new Error(d['error-message'] || d.status);
        for (const [g, f] of Object.entries(GRADE_FIELDS)) {
          const cents = num(d[f]);
          if (cents) put(cards, c.id, g, {src: 'pricecharting', label: site, kind: 'sold', price: Math.round(cents) / 100, cur: 'USD', at: now, url: c.pc});
        }
      } catch (e) { errors.push(`${c.id}: ${e.message}`); }
      await sleep(PC_GAP);
    }
    return {cards, errors, covered: Object.keys(cards).length};
  }
};

export const SOURCES = [fx, pokemontcg, scryfall, pricecharting];
