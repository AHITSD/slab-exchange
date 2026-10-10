// Writes recorded and sample source responses for the tests. Pokémon TCG API responses for
// swsh7-215, swsh12-186 and sv3-223 were recorded on 10 Oct 2026; the rest are made-up sample values.
import {writeFileSync, mkdirSync} from 'node:fs';
import {fixtureName} from '../lib/net.js';
const dir = new URL('./fixtures/', import.meta.url).pathname; mkdirSync(dir, {recursive: true});
const put = (url, body) => writeFileSync(dir + fixtureName(url), JSON.stringify(body, null, 1));
const cm = (avg7, trend, at) => ({updatedAt: at, prices: {averageSellPrice: trend, trendPrice: trend, avg1: avg7, avg7, avg30: trend}});
const tp = (market, at) => ({updatedAt: at, url: 'https://prices.pokemontcg.io/tcgplayer/x', prices: {holofoil: {low: market * .8, mid: market, high: market * 3, market, directLow: null}}});
put('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP', {amount: 1, base: 'USD', date: '2026-10-09', rates: {EUR: 0.89238, GBP: 0.75641}});
put('https://api.pokemontcg.io/v2/cards/swsh7-215', {data: {id: 'swsh7-215', name: 'Umbreon VMAX', tcgplayer: tp(2283.14, '2026/09/18'), cardmarket: cm(1674.5, 1579.48, '2025/11/18')}});
put('https://api.pokemontcg.io/v2/cards/swsh12-186', {data: {id: 'swsh12-186', name: 'Lugia V', tcgplayer: tp(505.76, '2026/10/10'), cardmarket: cm(367.3, 387.8, '2025/11/18')}});
put('https://api.pokemontcg.io/v2/cards/sv3-223', {data: {id: 'sv3-223', name: 'Charizard ex', tcgplayer: tp(97.56, '2026/10/10'), cardmarket: cm(78.73, 78.53, '2025/11/18')}});
put('https://api.pokemontcg.io/v2/cards/swsh11-186', {data: {id: 'swsh11-186', name: 'Giratina V', tcgplayer: tp(755.2, '2026/10/10'), cardmarket: cm(640, 655, '2026/10/09')}});
const sf = (usd, eur) => ({object: 'card', prices: {usd: usd == null ? null : String(usd), usd_foil: null, eur: eur == null ? null : String(eur), eur_foil: null, tix: null}, purchase_uris: {tcgplayer: 'https://www.tcgplayer.com/x', cardmarket: 'https://www.cardmarket.com/x'}, scryfall_uri: 'https://scryfall.com/card/x'});
put('https://api.scryfall.com/cards/named?exact=Black%20Lotus&set=2ed', sf(null, null));
put('https://api.scryfall.com/cards/named?exact=Ragavan%2C%20Nimble%20Pilferer&set=mh2', sf(44.1, 38.5));
put('https://api.scryfall.com/cards/named?exact=Sheoldred%2C%20the%20Apocalypse&set=dmu', sf(92.3, 79.9));
put('https://api.scryfall.com/cards/named?exact=Liliana%20of%20the%20Veil&set=isd', sf(11.2, 8.4));
put('https://www.pricecharting.com/api/products?t=x&q=umbreon%20vmax%20215%20pokemon%20evolving%20skies', {status: 'success', products: [{id: '9001', 'product-name': 'Umbreon VMAX #215', 'console-name': 'Pokemon Evolving Skies'}, {id: '9002', 'product-name': 'Umbreon VMAX #95', 'console-name': 'Pokemon Evolving Skies'}]});
put('https://www.pricecharting.com/api/product?t=x&id=9001', {status: 'success', id: '9001', 'product-name': 'Umbreon VMAX #215', 'console-name': 'Pokemon Evolving Skies', 'loose-price': 189000, 'cib-price': 171500, 'new-price': 182000, 'graded-price': 214900, 'box-only-price': 301000, 'manual-only-price': 389900});
console.log('fixtures written to', dir);
