# Slab Exchange

Live prices for graded and ungraded trading cards, blended from several price guides, with a collection tracker, watchlist, price alerts and a trade checker.

One small Node.js server does everything: it serves the app, checks every price source on its own schedule, blends the results into one price per card and grade, and pushes any change straight to every open browser. There are no dependencies to install and no database to run.

## Run it on your computer

You need Node.js 20 or newer.

```
cp .env.example .env
npm run dev
```

Then open http://localhost:3000. `npm test` runs the tests against recorded source responses, without touching the network.

## How prices work

Every few minutes the server checks which sources are due and asks only those for new numbers:

| Source | What it gives | Checked every | Needs |
|---|---|---|---|
| PriceCharting and SportsCardsPro | Every grade, worked out from sold listings | Hour | A paid API token (`PRICECHARTING_TOKEN`) and, for a public app, a commercial licence |
| Pokémon TCG API | TCGplayer and Cardmarket prices for ungraded Pokémon cards | Hour | Nothing (an API key raises the request limit) |
| Scryfall | TCGplayer and Cardmarket prices for ungraded Magic cards | 12 hours (Scryfall updates once a day) | Nothing |
| European Central Bank, via Frankfurter | Pound and euro exchange rates | 6 hours | Nothing |

Then, for each card and grade (see `lib/blend.js`):

1. Prices older than 14 days are left out.
2. If the same marketplace arrives through two feeds, only the freshest copy counts.
3. With three or more prices, any that's more than 35% from the median is left out.
4. The price is a weighted average of what's left. Prices from real sales count most (1.0), then market prices (0.9), recent averages (0.7) and asking prices (0.4). A price's weight halves for every week of age.
5. Confidence: high when three or more sources agree within 15%, medium when two or more agree within 30%, low otherwise. If nothing fresh is left, the last price stays and is marked out of date.

When a price changes, the server adds it to the card's price history and pushes it to every open browser. The page updates on screen, flashes the new price, and fires any price alert it crosses. Every card page shows each source's price, how much it counts, and why any source was left out.

**Without a PriceCharting token**, graded prices and all sports card prices stay at the snapshot collected on 10 Oct 2026, and drop to "out of date" after 14 days. The Pokémon and Magic ungraded prices stay live either way. The recorded sales shown on card pages are from the same snapshot, because no source here offers individual sales through an API.

## Put it online

The server needs to stay running to keep checking prices, and needs a disk that survives restarts for price history. Free plans that sleep when nobody is visiting stop the live updates.

**Railway.** Create a service from this repository, attach a volume at `/data`, and set `DATA_DIR=/data` and `RAILWAY_RUN_UID=0` (the volume is owned by root). Add a public domain under Networking.

**Render.** Push this folder to a GitHub repository. In Render choose New, then Blueprint, and pick the repository. `render.yaml` sets up the web service, a 1 GB disk and the settings below. Fill in `PRICECHARTING_TOKEN` when asked, or leave it empty for now.

**Anywhere with Docker** (Fly.io, Railway, a VPS):

```
docker build -t slab-exchange .
docker run -d -p 3000:3000 -v slab-data:/data --env-file .env slab-exchange
```

Point your domain at it and use the host's HTTPS. Live updates use Server-Sent Events over normal HTTPS, so they work behind standard proxies. If you put nginx in front, turn off response buffering for `/api/stream`.

## Settings

| Variable | What it does |
|---|---|
| `PORT` | Port to listen on. Most hosts set it. |
| `DATA_DIR` | Where prices and history are saved. Use a persistent disk. |
| `CHECK_EVERY_SECONDS` | How often to see which sources are due. Default 60. |
| `ADMIN_TOKEN` | Secret for `POST /api/collect`, which runs every source straight away. Empty switches it off. |
| `PRICECHARTING_TOKEN` | Paid PriceCharting / SportsCardsPro API token. |
| `POKEMONTCG_API_KEY` | Optional Pokémon TCG API key. |
| `USER_AGENT` | Sent to every source. Scryfall asks for an app name and a contact. |

## Keeping an eye on it

- `GET /api/status` shows when each source last answered, how many cards it covered and any problems, such as a card PriceCharting couldn't match.
- `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://your-site/api/collect` checks every source now.
- The server logs every source run and every price change.

The first time it runs with a PriceCharting token, the server looks up each card by its PriceCharting page name and only accepts an exact match of set and card name. Check `/api/status` under `matched`.

## Adding cards

A card needs three entries:

1. `lib/catalog.js`: its PriceCharting or SportsCardsPro page, plus a Pokémon TCG API id or Scryfall name and set when one of those prices the exact same printing.
2. `seed/seed.json`: a starting price for each grade (used until the sources answer).
3. `public/index.html`: the card in the `CARDS` list near the top of the script (name, set, number, year, game and the colours for its illustration).

Only add a source for a card when it prices exactly the same printing. Base Set Charizard on the Pokémon TCG API, for example, is the Unlimited print, so it isn't used for the 1st Edition card.

## Before you launch

- **Price data licences.** PriceCharting's API terms cover internal use. Showing its prices in a public app needs their commercial licence and written permission. Read the terms for Scryfall (no paywalls), the Pokémon TCG API and any source you add.
- **Card images.** The app draws original illustrations and lets each person add photos of their own cards. Official card art and other people's photos aren't included, because they belong to the card makers and photographers.
- **People's data.** Collections, watchlists, alerts and photos stay in each person's browser and never reach the server. Accounts that follow people between devices would need sign-in and a database.
- **Trades.** The Trade check page states that trades are between collectors and that Slab Exchange isn't responsible for any deal.
