import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blend} from '../lib/blend.js';

const NOW = Date.UTC(2026, 9, 10, 18);
const day = n => NOW - n * 86400000;
const q = (src, usd, kind, ageDays, extra) => Object.assign({src, label: src, kind, price: usd, cur: 'USD', usd, at: day(ageDays)}, extra);

test('one source gives that price with low confidence', () => {
  const b = blend([q('pricecharting', 100, 'sold', 0)], NOW);
  assert.equal(b.price, 100); assert.equal(b.level, 'low'); assert.equal(b.n, 1);
});

test('quotes older than 14 days are left out', () => {
  const b = blend([q('pricecharting', 100, 'sold', 0), q('tcgplayer', 300, 'market', 20)], NOW);
  assert.equal(b.price, 100);
  assert.equal(b.quotes.find(x => x.src === 'tcgplayer').why, 'stale');
});

test('the same marketplace through two feeds counts once, freshest wins', () => {
  const b = blend([q('tcgplayer', 100, 'market', 3, {via: 'A'}), q('tcgplayer', 110, 'market', 0, {via: 'B'}), q('pricecharting', 105, 'sold', 0)], NOW);
  assert.equal(b.n, 2);
  assert.equal(b.quotes.find(x => x.via === 'A').why, 'duplicate');
});

test('with three or more quotes, one far from the median is left out', () => {
  const b = blend([q('pricecharting', 100, 'sold', 0), q('tcgplayer', 104, 'market', 0), q('cardmarket', 98, 'trend', 0), q('ebay', 200, 'listing', 0)], NOW);
  assert.equal(b.quotes.find(x => x.src === 'ebay').why, 'outlier');
  assert.equal(b.n, 3); assert.equal(b.level, 'high');
  assert.ok(b.price > 98 && b.price < 104);
});

test('sold prices count more than asking prices, fresh more than old', () => {
  const b = blend([q('pricecharting', 100, 'sold', 0), q('ebay', 120, 'listing', 0)], NOW);
  assert.ok(b.price < 110, `got ${b.price}`);
  const c = blend([q('pricecharting', 100, 'sold', 7), q('tcgplayer', 120, 'market', 0)], NOW);
  assert.ok(c.price > 110, `got ${c.price}`);
});

test('confidence: medium when two sources are within 30%', () => {
  const b = blend([q('pricecharting', 439.31, 'sold', 0), q('tcgplayer', 505.76, 'market', 0)], NOW);
  assert.equal(b.level, 'medium');
  assert.ok(Math.abs(b.price - 470.78) < 0.05, `got ${b.price}`);
});

test('nothing usable gives no price', () => {
  const b = blend([q('pricecharting', 100, 'sold', 30)], NOW);
  assert.equal(b.price, null); assert.equal(b.level, 'none');
});

test('weights add up to 1 across used quotes', () => {
  const b = blend([q('pricecharting', 100, 'sold', 0), q('tcgplayer', 104, 'market', 1), q('cardmarket', 98, 'trend', 2)], NOW);
  const sum = b.quotes.reduce((a, x) => a + x.weight, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, `sum ${sum}`);
});
