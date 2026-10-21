# PokeWallet SDKs

[![CI](https://github.com/pokewallet-lab/pokewallet-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/pokewallet-lab/pokewallet-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@pokewallet/sdk?label=npm)](https://www.npmjs.com/package/@pokewallet/sdk)
[![PyPI](https://img.shields.io/pypi/v/pokewallet?label=PyPI)](https://pypi.org/project/pokewallet/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[PokeWallet](https://pokewallet.io) is a card price API: Pokémon, One Piece and ten more trading card games (Magic, Yu-Gi-Oh!, Lorcana, Digimon, Flesh and Blood and others), with TCGPlayer prices in USD and CardMarket prices in EUR. This repo has the official **TypeScript** and **Python** SDKs, which put all twelve games behind one interface, and an **MCP server** that lets MCP clients such as Claude Code and Cursor look up cards and prices with your own key.

- [1. Get an API key](#1-get-an-api-key)
- [2. Install](#2-install)
- [3. Quickstart](#3-quickstart)
- [4. Everything available](#4-everything-available)
- [5. Errors, retries and limits](#5-errors-retries-and-limits)
- [6. MCP server](#6-mcp-server)
- [7. Versioning and compatibility](#7-versioning-and-compatibility)
- [8. Key safety and license](#8-key-safety-and-license)

## 1. Get an API key

1. Sign up at **https://pokewallet.io/dashboard** and create a key. Keys start with `pk_`.
2. Keep it in an environment variable, never in your code or in git:

```sh
export POKEWALLET_API_KEY=pk_live_xxx    # your real key here
```

The SDKs read `POKEWALLET_API_KEY` by themselves. Put the same line in your shell profile or your secrets manager; keep `.env` files out of version control.

| Plan | Requests |
|---|---|
| Free | 100 per hour, 1,000 per day |
| Paid plans | higher limits, see https://pokewallet.io/pricing |

Free keys can search cards and read cards and sets. **Pro endpoints** (set prices, statistics, completion cost, trending sets, top cards, Pokémon price history) need a **Pro** plan for Pokémon and One Piece, or an **Ultra** plan for the ten other games. Every account can activate a **7-day free trial** of the Pro endpoints from the dashboard. Without access, the SDK raises `PlanRequiredError` with the link to activate the trial or upgrade.

## 2. Install

**TypeScript** (Node 18+, no runtime dependencies):

```sh
mkdir my-cards && cd my-cards && npm init -y
npm install @pokewallet/sdk
```

**Python** (3.9+, depends only on `httpx`):

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install pokewallet
```

The files of release v0.1.3, with their checksums (`SHA256SUMS`), also remain available on the [Releases page](https://github.com/pokewallet-lab/pokewallet-sdk/releases).

## 3. Quickstart

Your first result takes one file. Make sure `POKEWALLET_API_KEY` is set (step 1).

**TypeScript** — save as `first.mjs`, run with `node first.mjs`:

```js
import { PokeWallet } from '@pokewallet/sdk'

const pw = new PokeWallet() // reads POKEWALLET_API_KEY

const results = await pw.pokemon.search('charizard', { limit: 3 })
for (const card of results.items) {
  const usd = card.tcgplayer?.prices[0]?.market // TCGPlayer market price
  const eur = card.cardmarket?.prices[0]?.trend // CardMarket trend price
  console.log(`${card.name} | ${card.setName} #${card.number} | $${usd} / €${eur}`)
}

// One card in detail, by the id a search returned
const card = await pw.pokemon.card(results.items[0].id)
console.log(card.name, card.rarity, card.tcgplayer.prices.map((p) => `${p.variant}: $${p.market}`))

// A set, and every page of it without handling page numbers
const page = await pw.pokemon.set('PLF', { limit: 5 })
console.log(`${page.set.name}: ${page.total} cards`)
let count = 0
for await (const c of pw.pokemon.setCards('PLF', { maxItems: 120 })) count++
console.log(`walked ${count} cards`)

// Other games use the same methods
const lotus = await pw.games.mtg.search('black lotus', { limit: 2 })
console.log(lotus.items.map((c) => c.name))
console.log((await pw.onepiece.search('luffy', { limit: 2 })).items.map((c) => c.name))
```

**Python** — save as `first.py`, run with `python first.py`:

```python
from pokewallet import PokeWallet

pw = PokeWallet()  # reads POKEWALLET_API_KEY

results = pw.pokemon.search("charizard", limit=3)
for card in results.items:
    usd = card.tcgplayer.prices[0].market if card.tcgplayer and card.tcgplayer.prices else None  # TCGPlayer
    eur = card.cardmarket.prices[0].trend if card.cardmarket and card.cardmarket.prices else None  # CardMarket
    print(f"{card.name} | {card.set_name} #{card.number} | ${usd} / €{eur}")

# One card in detail, by the id a search returned
card = pw.pokemon.card(results.items[0].id)
print(card.name, card.rarity, [f"{p.variant}: ${p.market}" for p in card.tcgplayer.prices])

# A set, and every page of it without handling page numbers
page = pw.pokemon.set("PLF", limit=5)
print(f"{page.set.name}: {page.total} cards")
count = sum(1 for _ in pw.pokemon.set_cards("PLF", max_items=120))
print(f"walked {count} cards")

# Other games use the same methods
print([c.name for c in pw.games.mtg.search("black lotus", limit=2).items])
print([c.name for c in pw.onepiece.search("luffy", limit=2).items])
```

**Python, async** (`AsyncPokeWallet` has the same methods; await them and use `async for`):

```python
import asyncio
from pokewallet import AsyncPokeWallet

async def main():
    async with AsyncPokeWallet() as pw:
        pikachu, lotus = await asyncio.gather(
            pw.pokemon.search("pikachu", limit=2),
            pw.games.mtg.search("black lotus", limit=2),
        )
        print([c.name for c in pikachu.items], [c.name for c in lotus.items])
        async for card in pw.pokemon.set_cards("PLF", max_items=60):
            pass

asyncio.run(main())
```

No key yet? `health()` and `listGames()` / `list_games()` work without one:

```js
import { PokeWallet } from '@pokewallet/sdk'
const pw = new PokeWallet()                       // no key needed for these two
console.log((await pw.health()).status)            // "healthy"
console.log((await pw.listGames()).map((g) => g.code).join(' '))  // mtg ygo cfv ...
```

```python
from pokewallet import PokeWallet
pw = PokeWallet()
print(pw.health().status)                          # "healthy"
print(" ".join(g.code for g in pw.list_games()))   # mtg ygo cfv ...
```

More runnable scripts (pagination, error handling, Pro endpoints, other games, async) are in [`examples/ts`](examples/ts) and [`examples/py`](examples/py).

## 4. Everything available

Three worlds with the same methods: `pw.pokemon`, `pw.onepiece`, and `pw.games.<code>` for the ten other games (`mtg`, `ygo`, `cfv`, `dbs`, `fab`, `dgm`, `swu`, `lor`, `rft`, `cpk`; also `pw.game(code)` when the code is only known at runtime). The SDKs hide the differences between them: routes, set identifiers and the two pagination styles.

| TypeScript | Python | Returns | Access |
|---|---|---|---|
| `search(q, {page, limit})` | `search(q, page=, limit=)` | one page of cards with prices | free |
| `searchAll(q, {limit, maxItems})` | `search_all(...)` | iterator over every result | free |
| `card(id)` | `card(id)` | one card | free |
| `sets({language})` | `sets(language=)` | all sets | free |
| `set(code, {page, limit})` | `set(code, page=, limit=)` | one page of a set's cards | free |
| `setCards(code, {limit, maxItems})` | `set_cards(...)` | iterator over a whole set | free |
| `prices(code)` | `prices(code)` | prices of every card in a set (one row per finish; sealed products included, `productType` tells them apart) | Pro |
| `statistics(code, {variant})` | `statistics(code, variant=)` | average, min, max, most expensive card, trend, rarity breakdown; `variant` is `normal` or `foil` | Pro |
| `completionValue(code)` | `completion_value(code)` | cost of one copy of every card in its base finish | Pro |
| `trending({limit})` | `trending(limit=)` | sets with the biggest CardMarket price moves over 7 days (`period` can only be `7d`; anything else is refused before sending) | Pro |
| `topCards({metric, source, limit})` | `top_cards(...)` | ranking by price (TCGPlayer market price, CardMarket trend price) or 7-day growth; each item has the card `id`, set, rarity, `price` and, for growth, `change7d`; TCGPlayer growth is Pokémon only | Pro |
| `pokemon.priceHistory(id)` | `pokemon.price_history(id)` | price snapshots at 7/14/30/60/120 days | Pro, Pokémon only |
| `health()` | `health()` | service status and per-service checks | no key needed |
| `listGames()` | `list_games()` | the ten games and their routes | no key needed |
| `imageUrl(id)` | `image_url(id)` | an image URL (see below) | free |

"Pro" means a Pro plan or the 7-day trial for Pokémon and One Piece, and an Ultra plan or the trial for the ten other games. Limits: `limit` is at most 100 for searches, 200 for set pages, 50 for trending and 100 for top cards; the SDK checks `page`, `limit`, `period` and `variant` before sending anything.

Statistics and completion value describe a set the same way in every world: `set` has `id`, `code`, `name` and `totalCards` (cards, not finishes; sealed products are not counted), and the most expensive card of each side has its `id`, `name` and `price`. Card ids from rankings open with `card(id)`. A search page has `truncated`, true when the candidate list was cut at its cap (Pokémon and the ten games): refine the query instead of paging. A card's `variants` lists its finishes, `Normal` first, then alphabetical.

Every returned object has the same fields in both languages (`camelCase` in TypeScript, `snake_case` in Python): a card has `id`, `name`, `number`, `rarity`, `setId`, `setCode`, `setName`, `tcgplayer.prices[]` (finish, `market`, `low`, `mid`, `high`, `directLow`) and `cardmarket.prices[]` (`avg`, `low`, `trend`, `avg1`, `avg7`, `avg30`). Prices are numbers, or `null` / `None` when missing. Game-specific fields (`hp`, `attacks`, Magic's `p` and `t`, One Piece `ext_*`) are in `card.info`, and the untouched server value is always in `card.raw`.

**Images:** `imageUrl(id)` only builds the URL. Image routes need your key in the `X-API-Key` header, so the URL cannot go straight into an `<img>` tag; fetch it with the header or proxy it from your server.

## 5. Errors, retries and limits

Every failure is a typed error, all subclasses of `PokeWalletError`:

| Error | When | Useful fields |
|---|---|---|
| `ValidationError` | bad arguments, or no API key; raised before any request | |
| `AuthError` | 401: key missing, malformed or unknown | |
| `PlanRequiredError` | 403: plan or trial does not cover this endpoint | `redeemUrl` (activate the trial), `upgradeUrl` |
| `FeatureNotEnabledError` | 403: this account does not have access to this feature | `contactUrl` |
| `NotFoundError` | 404: unknown card or set | `didYouMean`, `suggestions` |
| `GameUnavailableError` | 404 on a game route that is switched off | |
| `AmbiguousSetError` | a set code matches several sets | `matches` (each has `setId`, `setCode`, `name`, `language`) |
| `RateLimitError` | 429: quota used up | `limits`, `retryAfter` |
| `UnavailableError` | 503: service busy | `retryAfter` |
| `NetworkError`, `ServerError` | no answer, other 5xx | |

```ts
import { AmbiguousSetError, PlanRequiredError } from '@pokewallet/sdk'

try {
  const trending = await pw.pokemon.trending()
} catch (e) {
  if (e instanceof PlanRequiredError) console.log(`Needs Pro: ${e.redeemUrl ?? e.upgradeUrl}`)
  else throw e
}

try {
  await pw.pokemon.set('PR')                       // "PR" exists in many sets
} catch (e) {
  if (e instanceof AmbiguousSetError) {
    const page = await pw.pokemon.set(e.matches[0].setId)   // pick one by its setId
  } else throw e
}
```

```python
from pokewallet import AmbiguousSetError, PlanRequiredError

try:
    trending = pw.pokemon.trending()
except PlanRequiredError as e:
    print(f"Needs Pro: {e.redeem_url or e.upgrade_url}")

try:
    pw.pokemon.set("PR")                           # "PR" exists in many sets
except AmbiguousSetError as e:
    page = pw.pokemon.set(e.matches[0].set_id)     # pick one by its set_id
```

An ambiguous set code is reported the same way on every endpoint, even though the API answers it three different ways.

**Retries.** The SDK retries only two situations: a **429** that carries a `Retry-After` header within 30 seconds (and whose quota is not already exhausted), and a **503**, up to 2 times, honoring `Retry-After`. It never retries other errors, and never guesses a wait. Options: `maxRetries`, `retryAfterCapSeconds`, `timeoutMs`, `fetch` (TypeScript); `max_retries`, `retry_after_cap`, `timeout`, `transport` (Python).

**Quota.** After any call, `pw.lastRateLimit` (Python: `pw.last_rate_limit`) holds `limitHour`, `remainingHour`, `limitDay` and `remainingDay`. The free plan allows 100 requests per hour; a `RateLimitError` has `limits` (`hourly` / `daily`) showing what is left. Error responses count against your quota too.

**Service status.** `health()` returns `status` (`healthy` or `unhealthy`) and a check per service. If the API reports itself unhealthy (HTTP 503), you still get that report back as data, not an exception.

## 6. MCP server

`packages/mcp` is a small server for the [Model Context Protocol](https://modelcontextprotocol.io). It lets an MCP client (Claude Code, Cursor, Claude Desktop through `mcp-remote`, ...) search cards and read prices using **your own key**: the client sends `Authorization: Bearer pk_…`, the server forwards it to PokeWallet and keeps nothing. Your plan and quota stay yours, and every tool call uses one request of your quota.

Tools (all read-only): `list_games`, `search_cards` (at most 10 results), `get_card`, `list_sets` (filter by name or language), `get_set` (an ambiguous set returns its alternatives), `get_price_history` (Pokémon), `top_cards`, `trending_sets`, `set_statistics`, `set_completion_value`. `trending_sets` covers the last 7 days, the only period. A `game` parameter picks `pokemon` (default), `onepiece` or a game code.

The hosted server is at `https://mcp.pokewallet.io/mcp`. Connect a client, passing your key as a Bearer header.

**Claude Code:**

```sh
claude mcp add --transport http pokewallet https://mcp.pokewallet.io/mcp \
  --header "Authorization: Bearer $POKEWALLET_API_KEY"
```

This saves the key in Claude Code's own config on your machine, like any header you pass.

**Cursor** — `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "pokewallet": {
      "url": "https://mcp.pokewallet.io/mcp",
      "headers": { "Authorization": "Bearer ${env:POKEWALLET_API_KEY}" }
    }
  }
}
```

**`mcp-remote`** (for clients that only speak stdio, such as Claude Desktop) — in the client's MCP config:

```json
{
  "mcpServers": {
    "pokewallet": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.pokewallet.io/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer pk_live_xxx" }
    }
  }
}
```

Replace `pk_live_xxx` with your key; this file is the one place where it has to be written down, so keep the file private.

**Run it locally instead** (needs the repo, Node 22+):

```sh
gh repo clone pokewallet-lab/pokewallet-sdk && cd pokewallet-sdk
(cd packages/ts && npm install && npm run build)
cd packages/mcp && npm install && npx wrangler dev
```

The local endpoint is `http://127.0.0.1:8787/mcp`: use it in place of the hosted URL above, and add `--allow-http` to the `mcp-remote` arguments, since the URL is plain `http://`. See [`packages/mcp`](packages/mcp) for details.

## 7. Versioning and compatibility

The SDKs follow [semantic versioning](https://semver.org). While the version is `0.x` the surface is still settling, so a minor release (`0.2.0`) may contain breaking changes; they are listed in the release notes. From `1.0` on, breaking changes only come in major releases. The TypeScript and Python packages are versioned and released independently.

- **Breaking:** removing or renaming a method, option, field or error class; changing a return type or what an error means; changing the default retry behavior; raising the minimum Node.js or Python version.
- **Not breaking:** new methods, new optional parameters, new fields on returned objects, new error subclasses, bug fixes.

How the SDKs relate to API changes:

| What changes in the API | What you need |
|---|---|
| New cards, new sets, new prices | Nothing: it is data |
| New fields in a response | Nothing: they appear in `.raw` right away and get a typed field in a later release |
| A new endpoint, or a new game | An SDK release; unknown games are skipped by `listGames()` until then |
| A field or endpoint changes or is removed | An SDK release; the weekly contract run against the live API is meant to catch this first |

## 8. Key safety and license

- Read the key from the environment. Do not commit it, print it, or paste it into issues.
- The SDKs hold the key in private storage, show it as `pk_***` in `JSON.stringify`, `repr`, `util.inspect`, errors and logs, and remove it from any server text that echoes it. Python clients cannot be pickled or copied.
- If a key leaks, revoke it in the dashboard and create a new one.

MIT License, Copyright (c) 2026 PokeWallet. See [LICENSE](LICENSE).

Package documentation: [`packages/ts`](packages/ts/README.md) (TypeScript), [`packages/py`](packages/py/README.md) (Python), [`packages/mcp`](packages/mcp/README.md) (MCP server), [`openapi/pokewallet.yaml`](openapi/pokewallet.yaml) (API specification).

### Attribution

If you show data obtained through the PokeWallet API, the SDKs or the MCP server to other people (an app, website, bot, dashboard, report, published content, or an AI assistant answer you publish), credit PokéWallet with the visible text "Data by PokéWallet" (or "Powered by PokéWallet") linking to <https://pokewallet.io>. Private use needs no attribution. See the [Terms of Use](https://pokewallet.io/terms-conditions).

This is about the data and the service. The MIT license of the code is separate.

<details>
<summary>For maintainers</summary>

### Repository layout

| Path | What |
|---|---|
| `openapi/pokewallet.yaml` | Hand-written OpenAPI 3.1 spec of the API as it behaves today; the TypeScript types are generated from it |
| `packages/ts` | `@pokewallet/sdk`, zero runtime dependencies, ESM + CJS, Node 18+ |
| `packages/py` | `pokewallet`, Python 3.9+, `httpx` only, sync and async |
| `packages/mcp` | Stateless MCP server on a Cloudflare Worker, hosted at `https://mcp.pokewallet.io/mcp` |
| `examples/ts`, `examples/py` | Runnable examples |
| `.github/scripts` | Helper scripts used by the CI and release workflows |
| `tests/fixtures` | Recorded API answers shared by the TypeScript, Python and MCP unit tests |

The MCP package is not published to a package registry. The two SDK packages are published through the tag workflow described under Release. CI is `.github/workflows/ci.yml`: typecheck and unit tests only, no key.

### Tests

| Level | Command | Needs |
|---|---|---|
| Unit | `cd packages/ts && npm test` | `npm install` |
| | `cd packages/py && python -m pytest` | `pip install -e '.[test]'` |
| | `cd packages/mcp && npm test` | `npm install` in `packages/ts` and `packages/mcp`; run `npm run typecheck` once to build the SDK |
| Contract (live API, about 45 calls each) | `cd packages/ts && npm run test:contract` | `POKEWALLET_API_KEY` |
| | `cd packages/py && python -m pytest tests/contract` | `POKEWALLET_API_KEY` |
| MCP end to end (local `wrangler dev`, live API) | `cd packages/mcp && npm run test:e2e` | `POKEWALLET_API_KEY` |
| Customer-style | `npm pack` / `pip wheel .`, install in a fresh folder or venv, run the README snippets | `POKEWALLET_API_KEY` |

Contract and end-to-end tests skip cleanly without a key (the two key-less endpoint tests always run). Load the key into the process that needs it and mask the output:

```sh
( set -a; . <(grep '^POKEWALLET_API_KEY=' /path/to/.dev.vars); set +a; npm run test:contract ) 2>&1 | sed -E 's/pk_[A-Za-z0-9_-]{6,}/pk_***/g'
```

### Release

Releases are published by GitHub Actions from version tags: `ts-v<semver>` for the TypeScript package and `py-v<semver>` for the Python package. A tag runs `release.yml`, which checks that the tag matches the version in the package files, runs the unit tests, builds, and publishes after a maintainer approves the run on the `release` environment. Each pull request runs a publish dry-run (`publish-check.yml`), and a weekly job (`drift.yml`) runs the contract tests against the live API.

- **PyPI** uses Trusted Publishing; no token is stored.
- **npm**: the first version (0.1.1) was published manually, which is how a new package is created. Later versions are published by the workflow through npm Trusted Publishing, which must be configured in the settings of `@pokewallet/sdk` on npmjs.com: provider GitHub Actions, owner `pokewallet-lab`, repository `pokewallet-sdk`, workflow `release.yml`, environment `release`, with **Allow `npm publish`** checked (without it only `npm stage publish` is allowed and the workflow fails with `403 OIDC permission denied for this action`). Staged publishing of a new package needs an approval with two-factor authentication on npmjs.com; new releases of an existing package go through the workflow.

</details>
