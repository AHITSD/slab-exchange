// The cards the app tracks, and where each one can be found in every price source.
//
// pc       PriceCharting or SportsCardsPro product page (needs PRICECHARTING_TOKEN to refresh;
//          without it the app keeps the snapshot collected on 10 Oct 2026)
// ptcg     Pokémon TCG API card id and price variant (TCGplayer and Cardmarket prices, ungraded)
// scry     Scryfall name and set code (TCGplayer and Cardmarket prices for Magic, ungraded)
//
// Only list a source when it prices the exact same printing. Base Set Charizard on the Pokémon TCG API,
// for example, is the Unlimited print, so it is not used for the 1st Edition card here.

export const GRADE_FIELDS = {
  R: 'loose-price', '7': 'cib-price', '8': 'new-price', '9': 'graded-price', '9.5': 'box-only-price', '10': 'manual-only-price'
};

export const CATALOG = [
  {id: 'UMBEV', pc: 'https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215', ptcg: {id: 'swsh7-215', variant: 'holofoil'}},
  {id: 'LUGST', pc: 'https://www.pricecharting.com/game/pokemon-silver-tempest/lugia-v-186', ptcg: {id: 'swsh12-186', variant: 'holofoil'}},
  {id: 'GIRLO', pc: 'https://www.pricecharting.com/game/pokemon-lost-origin/giratina-v-186', ptcg: {id: 'swsh11-186', variant: 'holofoil'}},
  {id: 'CZDOF', pc: 'https://www.pricecharting.com/game/pokemon-obsidian-flames/charizard-ex-223', ptcg: {id: 'sv3-223', variant: 'holofoil'}},
  {id: 'CZDB1', pc: 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4'},
  {id: 'LOTUS', pc: 'https://www.pricecharting.com/game/magic-unlimited/black-lotus', scry: {name: 'Black Lotus', set: '2ed'}},
  {id: 'RAGMH', pc: 'https://www.pricecharting.com/game/magic-modern-horizons-2/ragavan-nimble-pilferer-138', scry: {name: 'Ragavan, Nimble Pilferer', set: 'mh2'}},
  {id: 'SHEDU', pc: 'https://www.pricecharting.com/game/magic-dominaria-united/sheoldred-the-apocalypse-107', scry: {name: 'Sheoldred, the Apocalypse', set: 'dmu'}},
  {id: 'LILVT', pc: 'https://www.pricecharting.com/game/magic-innistrad/liliana-of-the-veil-105', scry: {name: 'Liliana of the Veil', set: 'isd'}},
  {id: 'MJF86', pc: 'https://www.sportscardspro.com/game/basketball-cards-1986-fleer/michael-jordan-57'},
  {id: 'LBJTC', pc: 'https://www.sportscardspro.com/game/basketball-cards-2003-topps-chrome/lebron-james-111'},
  {id: 'WEMBY', pc: 'https://www.sportscardspro.com/game/basketball-cards-2023-panini-prizm/victor-wembanyama-silver-136'},
  {id: 'MAHPZ', pc: 'https://www.sportscardspro.com/game/football-cards-2017-panini-prizm/patrick-mahomes-ii-269'},
  {id: 'OHTUS', pc: 'https://www.sportscardspro.com/game/baseball-cards-2018-topps-update/shohei-ohtani-us1'},
  {id: 'BEWDL', pc: 'https://www.pricecharting.com/game/yugioh-legend-of-blue-eyes-white-dragon/blue-eyes-white-dragon-1st-edition-lob-001'},
  {id: 'DMGMF', pc: "https://www.pricecharting.com/game/yugioh-magician's-force/dark-magician-girl-1st-edition-mfc-000"}
];
