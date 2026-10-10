// Combines several price quotes for one card in one grade into a single price.
//
// A quote is {src, label, via, kind, price, cur, usd, at, url}:
//   src   which marketplace or guide the number comes from (tcgplayer, cardmarket, pricecharting)
//   kind  sold    = worked out from completed sales
//         market  = a marketplace's own market price (also based on recent sales)
//         trend   = a smoothed trend line
//         listing = what sellers are asking
//   usd   the price converted to US dollars
//   at    when the source last updated that number (ms since epoch)
//
// Rules, in order:
//   1. Quotes older than maxAgeDays are left out ("stale").
//   2. If the same marketplace arrives through two feeds, only the freshest is kept ("duplicate").
//   3. With three or more quotes, any quote more than outlier (35%) from the median is left out ("outlier").
//   4. The price is a weighted average of what's left. Weight = kind weight x freshness,
//      where freshness halves every halfLifeDays (counted in whole days).
//   5. Confidence: high = 3+ sources within 15% of each other, medium = 2+ within 30%, low otherwise.

export const KIND_WEIGHT = {sold: 1, market: 0.9, trend: 0.7, listing: 0.4};
export const DEFAULTS = {maxAgeDays: 14, halfLifeDays: 7, outlier: 0.35};

const DAY = 86400000;

export function median(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function blend(quotes, now = Date.now(), opts = {}) {
  const o = Object.assign({}, DEFAULTS, opts);
  const out = quotes
    .filter(q => q && q.usd > 0 && Number.isFinite(q.usd))
    .map(q => Object.assign({}, q, {used: false, why: null}));

  for (const q of out) {
    const age = q.at ? (now - q.at) / DAY : 0;
    q.ageDays = Math.max(0, Math.floor(age)); // whole days, so a price only shifts when a source changes or a day passes
    if (age > o.maxAgeDays) q.why = 'stale';
  }

  // the same marketplace through two feeds counts once
  const bySrc = {};
  for (const q of out) {
    if (q.why) continue;
    const prev = bySrc[q.src];
    if (!prev) { bySrc[q.src] = q; continue; }
    if ((q.at || 0) > (prev.at || 0)) { prev.why = 'duplicate'; bySrc[q.src] = q; } else q.why = 'duplicate';
  }

  let live = out.filter(q => !q.why);
  if (live.length >= 3) {
    const m = median(live.map(q => q.usd));
    for (const q of live) if (Math.abs(q.usd / m - 1) > o.outlier) q.why = 'outlier';
    live = live.filter(q => !q.why);
  }

  if (!live.length) return {price: null, level: 'none', n: 0, spread: null, quotes: out};

  let wsum = 0, vsum = 0;
  for (const q of live) {
    q.weight = (KIND_WEIGHT[q.kind] || 0.5) * Math.pow(0.5, q.ageDays / o.halfLifeDays);
    q.used = true;
    wsum += q.weight; vsum += q.weight * q.usd;
  }
  const price = Math.round(vsum / wsum * 100) / 100;
  const lo = Math.min(...live.map(q => q.usd)), hi = Math.max(...live.map(q => q.usd));
  const spread = live.length > 1 ? (hi - lo) / price : 0;
  const n = live.length;
  const level = n >= 3 && spread <= 0.15 ? 'high' : n >= 2 && spread <= 0.3 ? 'medium' : 'low';
  for (const q of out) q.weight = q.used ? Math.round(q.weight / wsum * 1000) / 1000 : 0;
  return {price, level, n, spread: Math.round(spread * 1000) / 1000, quotes: out};
}
